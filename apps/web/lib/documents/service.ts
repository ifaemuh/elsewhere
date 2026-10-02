import 'server-only';
import { appUrl } from '@/lib/env';
import { documentNotice } from '@/lib/notify/templates';
import { queueNotifications } from '@/lib/notify/queue';
import { getLibrary } from '@/lib/rules/library';
import { US_JURISDICTION } from '@/lib/flights/regions';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkMember, documentRulesCover, NO_COVERAGE_DETAIL } from './check';
import { documentSituation } from './facts';

/** Replaces every member's checks for the trip, and opens, closes or reopens each member's action item. Runs on join, on document save, on booking confirmation, at T-30 days (Task 16's daily cron), and at T-72h. */
export async function runDocumentChecks(tripId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: trip, error: tripError } = await admin.from('trips').select('id, name, destination_country, end_date').eq('id', tripId).single();
  if (tripError) throw new Error(tripError.message);
  if (!trip) return;
  const { data: members, error: membersError } = await admin.from('trip_members').select('id, user_id').eq('trip_id', tripId);
  if (membersError) throw new Error(membersError.message);
  const { data: segments, error: segmentsError } = await admin.from('booking_segments').select('origin_country, destination_country').eq('trip_id', tripId);
  if (segmentsError) throw new Error(segmentsError.message);
  const resolved = (segments ?? []).filter((s) => s.origin_country && s.destination_country);
  const domesticFlight = resolved.length === 0 ? null : resolved.some((s) => US_JURISDICTION.has(s.origin_country!) && US_JURISDICTION.has(s.destination_country!));
  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: documents, error: documentsError } = await admin.from('member_documents').select('user_id, kind, issuing_country, expires_on, real_id_compliant').in('user_id', userIds);
  if (documentsError) throw new Error(documentsError.message);

  const rules = getLibrary().rules;
  // Without a verified document rule for this trip, nothing was checked: say so, and never raise an item or a notification.
  const covered = documentRulesCover(rules, documentSituation({ destinationCountry: trip.destination_country, tripEnd: null, passport: null, realIdCompliant: null, domesticFlight }));
  const rows: Record<string, unknown>[] = [];
  const flaggedMembers: { id: string; user_id: string; ruleTitle: string }[] = [];
  for (const member of members ?? []) {
    if (!covered) {
      rows.push({ member_id: member.id, user_id: member.user_id, rule_id: null, rule_version: null, result: 'unknown', detail: NO_COVERAGE_DETAIL });
      continue;
    }
    const mine = (documents ?? []).filter((d) => d.user_id === member.user_id);
    const passport = mine.find((d) => d.kind === 'passport');
    const realId = mine.find((d) => d.kind === 'real_id');
    const checks = checkMember(
      rules,
      documentSituation({
        destinationCountry: trip.destination_country,
        tripEnd: trip.end_date,
        passport: passport ? { issuingCountry: passport.issuing_country, expiresOn: passport.expires_on } : null,
        realIdCompliant: realId?.real_id_compliant ?? null,
        domesticFlight,
      }),
    );
    for (const check of checks) {
      rows.push({ member_id: member.id, user_id: member.user_id, rule_id: check.rule?.id ?? null, rule_version: check.rule?.version ?? null, result: check.result, detail: check.detail });
    }
    const failing = checks.find((c) => c.result === 'action_needed' && c.rule);
    if (failing) flaggedMembers.push({ id: member.id, user_id: member.user_id, ruleTitle: failing.rule!.title });
  }

  const { error: replaceError } = await admin.rpc('replace_document_checks', { p_trip_id: tripId, p_rows: rows });
  if (replaceError) throw new Error(replaceError.message);

  const notify = await syncActionItems(admin, tripId, members ?? [], flaggedMembers);
  if (notify.length > 0) {
    await queueNotifications({
      userIds: notify,
      tripId,
      template: 'document_check',
      rendered: documentNotice({ tripName: trip.name, url: `${appUrl()}/trips/${tripId}/documents` }),
      urgent: false,
    });
  }
}

const ITEM_TITLE = 'Check your travel documents';

/** One item per member. Opens it, reopens a finished one that regressed, closes it once fixed. Returns the users to notify: only on open or reopen. */
async function syncActionItems(
  admin: ReturnType<typeof createAdminClient>,
  tripId: string,
  members: { id: string; user_id: string }[],
  flagged: { id: string; user_id: string; ruleTitle: string }[],
): Promise<string[]> {
  const { data: existing, error } = await admin
    .from('action_items')
    .select('id, related_entity_id, status')
    .eq('trip_id', tripId)
    .eq('source_kind', 'document_check')
    .eq('title', ITEM_TITLE);
  if (error) throw new Error(error.message);
  const byMember = new Map((existing ?? []).map((i) => [i.related_entity_id as string, i]));
  const flaggedIds = new Set(flagged.map((f) => f.id));
  const notify: string[] = [];

  for (const f of flagged) {
    const item = byMember.get(f.id);
    if (!item) {
      const { data: inserted, error: insertError } = await admin
        .from('action_items')
        .upsert(
          { trip_id: tripId, kind: 'document', title: ITEM_TITLE, detail: f.ruleTitle, assigned_user_ids: [f.user_id], source_kind: 'document_check', related_entity_id: f.id },
          { onConflict: 'trip_id,source_kind,related_entity_id,title', ignoreDuplicates: true },
        )
        .select('id');
      if (insertError) throw new Error(insertError.message);
      if (inserted && inserted.length > 0) notify.push(f.user_id);
    } else if (item.status === 'done') {
      // Guarded on status so overlapping runs reopen, and notify, once.
      const { data: reopened, error: reopenError } = await admin
        .from('action_items')
        .update({ status: 'open', detail: f.ruleTitle })
        .eq('id', item.id)
        .eq('status', 'done')
        .select('id');
      if (reopenError) throw new Error(reopenError.message);
      if (reopened && reopened.length > 0) notify.push(f.user_id);
    }
  }

  const fixed = members.filter((m) => !flaggedIds.has(m.id) && byMember.get(m.id) && byMember.get(m.id)!.status !== 'done').map((m) => byMember.get(m.id)!.id);
  if (fixed.length > 0) {
    const { error: closeError } = await admin.from('action_items').update({ status: 'done' }).in('id', fixed);
    if (closeError) throw new Error(closeError.message);
  }
  return notify;
}
