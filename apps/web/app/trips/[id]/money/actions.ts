'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/user';
import { MAX_CENTS, parseDollars, type Split } from '@/lib/expenses/settle';
import { createClient } from '@/lib/supabase/server';

export interface ExpenseState {
  error: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505';

/**
 * tripId and every form field are client-controlled. The caller must be on the trip, and the payer (always the caller),
 * everyone in the split and the amount are checked against the trip's members before anything is written. The form's
 * one-time `key` makes a double click land on the expense it already made (unique (trip_id, client_key)).
 */
export async function addExpense(tripId: string, _prev: ExpenseState, form: FormData): Promise<ExpenseState> {
  const user = await requireUser(`/trips/${tripId}/money`);
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc('is_trip_member', { p_trip_id: tripId });
  if (isMember !== true) return { error: 'Only people on this trip can add expenses.' };

  const key = String(form.get('key') ?? '');
  const description = String(form.get('description') ?? '').trim();
  const cents = parseDollars(String(form.get('amount') ?? ''));
  if (!UUID.test(key)) return { error: 'Reload the page and try again.' };
  if (!description || description.length > 200) return { error: 'Say what it was for, in under 200 characters.' };
  if (cents === null) return { error: `Enter an amount in dollars and cents, up to $${(MAX_CENTS / 100).toLocaleString('en-US')}.` };

  const { data: rows } = await supabase.from('trip_members').select('user_id').eq('trip_id', tripId);
  const memberIds = new Set((rows ?? []).map((r) => r.user_id as string));
  if (!memberIds.has(user.id)) return { error: 'Only people on this trip can add expenses.' };

  // Exact amounts: any "share:<user id>" field that is filled switches the split from equal to exact.
  const exact = [...form.entries()].filter(([name, value]) => name.startsWith('share:') && String(value).trim() !== '');
  let split: Split;
  if (exact.length > 0) {
    const shares: Record<string, number> = {};
    for (const [name, value] of exact) {
      const id = name.slice('share:'.length);
      const share = parseDollars(String(value));
      if (!memberIds.has(id) || share === null) return { error: 'Each exact amount must be dollars and cents for someone on this trip.' };
      shares[id] = share;
    }
    if (Object.values(shares).reduce((a, b) => a + b, 0) !== cents) return { error: 'The exact amounts must add up to the total.' };
    split = { kind: 'shares', shares };
  } else {
    const userIds = [...new Set(form.getAll('splitWith').map(String))];
    if (userIds.length === 0) return { error: 'Choose who shares it.' };
    if (!userIds.every((id) => memberIds.has(id))) return { error: 'Everyone who shares it must be on this trip.' };
    split = { kind: 'equal', user_ids: userIds };
  }

  const { error } = await supabase.from('expenses').insert({
    trip_id: tripId,
    payer_user_id: user.id,
    amount_cents: cents,
    description,
    split,
    created_by: user.id,
    client_key: key,
  });
  // A repeat of the same submit: the expense is already there.
  if (error && error.code !== UNIQUE_VIOLATION) return { error: 'We could not add that expense.' };
  revalidatePath(`/trips/${tripId}/money`);
  return { error: null };
}

export interface SettleState {
  error: string | null;
}

const STALE = "Already settled, or the amounts changed. We've refreshed the totals.";

/**
 * Either person involved, or the planner, marks a transfer paid. The record_settlement function is the only write
 * path: under a per-trip lock it checks who is asking, that both people are on the trip, and that the amount is
 * not more than is still owed, then records it once per `key`. Anything that records nothing says so.
 */
export async function markSettled(tripId: string, fromUserId: string, toUserId: string, amountCents: number, key: string, _prev: SettleState): Promise<SettleState> {
  await requireUser(`/trips/${tripId}/money`);
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc('is_trip_member', { p_trip_id: tripId });
  if (isMember !== true) return { error: 'Only people on this trip can mark a payment.' };
  if (typeof key !== 'string' || !UUID.test(key)) return { error: 'Reload the page and try again.' };
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) return { error: 'That is not an amount that can be marked paid.' };
  if (fromUserId === toUserId) return { error: 'A payment needs two different people.' };

  const { error } = await supabase.rpc('record_settlement', {
    p_trip_id: tripId,
    p_from: fromUserId,
    p_to: toUserId,
    p_amount_cents: amountCents,
    p_client_key: key,
  });
  if (error) {
    revalidatePath(`/trips/${tripId}/money`);
    if (error.code === '22023') return { error: STALE };
    if (error.code === '42501') return { error: 'Only the two people involved, or the planner, can mark this paid.' };
    return { error: 'We could not mark that paid.' };
  }
  revalidatePath(`/trips/${tripId}/money`);
  return { error: null };
}
