'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { appUrl } from '@/lib/env';
import { voteNotice } from '@/lib/notify/templates';
import { queueNotifications } from '@/lib/notify/queue';
import { createClient } from '@/lib/supabase/server';
import { ALTERNATIVE_NOTE } from '@/lib/votes/alternatives';
import { canStartIncidentVote } from '@/lib/votes/access';

export interface VoteFormState {
  error: string | null;
}

const NOTE_SUFFIX = ` (${ALTERNATIVE_NOTE})`;

/**
 * The planner or an affected traveler starts an incident vote; any member starts a trip-level one. tripId, incidentId
 * and every form field are client-controlled, so the caller's role is checked first and the incident must belong to the trip. An incident has at most one open vote: a repeat
 * submit (or a race, caught by the unique index) lands on the vote that already exists, and notifies no one twice.
 */
export async function createVote(tripId: string, incidentId: string | null, _prev: VoteFormState, form: FormData): Promise<VoteFormState> {
  const user = await requireUser(`/trips/${tripId}`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  // An incident vote: the planner or someone the incident affects. A trip-level vote: any member (RLS agrees).
  let affected: string[] = [];
  if (incidentId) {
    const { data } = await supabase.from('incidents').select('id, affected_user_ids').eq('id', incidentId).eq('trip_id', tripId).maybeSingle();
    if (!data) return { error: 'That alert is not on this trip.' };
    affected = (data.affected_user_ids ?? []) as string[];
    if (!canStartIncidentVote(isPlanner === true, affected, user.id)) return { error: 'Only the planner or a traveler on the affected flight can start this vote.' };
  } else {
    const { data: isMember } = await supabase.rpc('is_trip_member', { p_trip_id: tripId });
    if (isMember !== true) return { error: 'Only people on this trip can start a vote.' };
  }

  const title = String(form.get('title') ?? '').trim().slice(0, 200);
  const options = String(form.get('options') ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!title || options.length < 2) return { error: 'Give the vote a question and at least two options, one per line.' };

  let required: string[] = [];
  if (incidentId) {
    required = affected;
    const { data: existing } = await supabase.from('votes').select('id').eq('incident_id', incidentId).eq('status', 'open').limit(1).maybeSingle();
    if (existing) redirect(`/trips/${tripId}/votes/${existing.id}`);
  }
  if (required.length === 0) {
    const { data: members } = await supabase.from('trip_members').select('user_id').eq('trip_id', tripId);
    required = (members ?? []).map((m) => m.user_id as string);
  }

  const { data: vote, error } = await supabase
    .from('votes')
    .insert({ trip_id: tripId, incident_id: incidentId, title, detail: String(form.get('detail') ?? '').slice(0, 2000), required_user_ids: required, created_by: user.id })
    .select('id')
    .single();
  if (error || !vote) {
    if (incidentId && error?.code === '23505') {
      // A second submit won the race: unique index votes_one_open_per_incident.
      const { data: existing } = await supabase.from('votes').select('id').eq('incident_id', incidentId).eq('status', 'open').limit(1).maybeSingle();
      if (existing) redirect(`/trips/${tripId}/votes/${existing.id}`);
    }
    return { error: 'We could not start the vote.' };
  }
  const { error: optionsError } = await supabase.from('vote_options').insert(
    options.map((line, index) => {
      const noted = line.endsWith(NOTE_SUFFIX);
      return { vote_id: vote.id, label: (noted ? line.slice(0, -NOTE_SUFFIX.length) : line).trim().slice(0, 200), note: noted ? ALTERNATIVE_NOTE : null, position: index + 1 };
    }),
  );
  if (optionsError) {
    // A vote with no options is no use; close it so the incident can start a fresh one.
    const { error: closeError } = await supabase.from('votes').update({ status: 'closed' }).eq('id', vote.id);
    if (closeError) {
      console.error('optionless vote could not be closed', vote.id, closeError);
      return { error: 'We could not start the vote, and the empty one could not be closed. Ask the planner to close it before trying again.' };
    }
    return { error: 'We could not start the vote.' };
  }

  try {
    const { data: trip } = await supabase.from('trips').select('name').eq('id', tripId).single();
    await queueNotifications({
      userIds: required.filter((id) => id !== user.id),
      tripId,
      template: 'vote',
      rendered: voteNotice({ tripName: trip?.name ?? 'Your trip', title, url: `${appUrl()}/trips/${tripId}/votes/${vote.id}` }),
      urgent: incidentId !== null,
      relatedEntityId: vote.id,
    });
  } catch (notifyError) {
    console.error('vote notification failed', vote.id, notifyError);
  }
  redirect(`/trips/${tripId}/votes/${vote.id}`);
}

const RESPOND_ERRORS: Record<string, string> = {
  '22023': 'That vote is closed.',
  '42501': 'This vote is for the travelers on the affected flight.',
  P0002: 'That vote is not on this trip.',
};

export async function respondVote(tripId: string, voteId: string, optionId: string): Promise<void> {
  await requireUser(`/trips/${tripId}/votes/${voteId}`);
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc('is_trip_member', { p_trip_id: tripId });
  if (isMember !== true) throw new Error('That vote is not on this trip.');
  // The vote must be on this trip and the option on this vote, before anything is written.
  const { data: vote } = await supabase.from('votes').select('id').eq('id', voteId).eq('trip_id', tripId).maybeSingle();
  if (!vote) throw new Error('That vote is not on this trip.');
  const { data: option } = await supabase.from('vote_options').select('id').eq('id', optionId).eq('vote_id', voteId).maybeSingle();
  if (!option) throw new Error('That option is not on this vote.');
  // respond_vote checks membership, the required voters, and that the vote is open, then inserts or changes the answer.
  const { error } = await supabase.rpc('respond_vote', { p_vote_id: voteId, p_option_id: optionId });
  if (error) throw new Error(RESPOND_ERRORS[error.code] ?? 'We could not record your vote.');
  revalidatePath(`/trips/${tripId}/votes/${voteId}`);
}

export async function closeVote(tripId: string, voteId: string): Promise<void> {
  await requireUser(`/trips/${tripId}/votes/${voteId}`);
  const supabase = await createClient();
  // RLS lets only the planner or the vote's creator update it; anyone else's update matches no row.
  const { data, error } = await supabase.from('votes').update({ status: 'closed' }).eq('id', voteId).eq('trip_id', tripId).select('id');
  if (error) throw new Error('We could not close the vote.');
  if (!data || data.length === 0) throw new Error('Only the planner or whoever started the vote can close it.');
  revalidatePath(`/trips/${tripId}/votes/${voteId}`);
}
