import 'server-only';
import { appUrl } from '@/lib/env';
import { documentNotice } from '@/lib/notify/templates';
import { queueNotifications } from '@/lib/notify/queue';
import { getLibrary } from '@/lib/rules/library';
import { US_JURISDICTION } from '@/lib/flights/regions';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkMember } from './check';
import { documentSituation } from './facts';

/** Replaces every member's checks for the trip. Runs on join, on document save, on booking confirmation, at T-30 days (Task 16's daily cron), and at T-72h. */
export async function runDocumentChecks(tripId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: trip } = await admin.from('trips').select('id, name, destination_country, end_date').eq('id', tripId).single();
  if (!trip) return;
  const { data: members } = await admin.from('trip_members').select('id, user_id').eq('trip_id', tripId);
  const { data: segments } = await admin.from('booking_segments').select('origin_country, destination_country').eq('trip_id', tripId);
  const resolved = (segments ?? []).filter((s) => s.origin_country && s.destination_country);
  const domesticFlight = resolved.length === 0 ? null : resolved.some((s) => US_JURISDICTION.has(s.origin_country!) && US_JURISDICTION.has(s.destination_country!));
  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: documents } = await admin.from('member_documents').select('user_id, kind, issuing_country, expires_on, real_id_compliant').in('user_id', userIds);

  const rules = getLibrary().rules;
  const rows: Record<string, unknown>[] = [];
  const newlyFlagged: string[] = [];
  for (const member of members ?? []) {
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
      rows.push({ trip_id: tripId, member_id: member.id, user_id: member.user_id, rule_id: check.rule?.id ?? null, rule_version: check.rule?.version ?? null, result: check.result, detail: check.detail });
      if (check.result === 'action_needed' && check.rule) {
        const { data: inserted } = await admin
          .from('action_items')
          .upsert(
            {
              trip_id: tripId,
              kind: 'document',
              title: 'Check your travel documents',
              detail: check.rule.title,
              assigned_user_ids: [member.user_id],
              source_kind: 'document_check',
              related_entity_id: member.id,
            },
            { onConflict: 'trip_id,source_kind,related_entity_id,title', ignoreDuplicates: true },
          )
          .select('id');
        if (inserted && inserted.length > 0) newlyFlagged.push(member.user_id);
      }
    }
  }

  await admin.from('document_checks').delete().eq('trip_id', tripId);
  if (rows.length > 0) await admin.from('document_checks').insert(rows);
  if (newlyFlagged.length > 0) {
    await queueNotifications({
      userIds: newlyFlagged,
      tripId,
      template: 'document_check',
      rendered: documentNotice({ tripName: trip.name, url: `${appUrl()}/trips/${tripId}/documents` }),
      urgent: false,
    });
  }
}
