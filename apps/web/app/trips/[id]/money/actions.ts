'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/user';
import { balances, MAX_CENTS, parseDollars, type Split } from '@/lib/expenses/settle';
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

/**
 * Either person involved, or the planner, marks a transfer paid. The two people must be on the trip and the amount
 * must not exceed what the ledger still has the payer owing the payee. A stale or repeated click (the debt is gone,
 * or the same `key`) records nothing and just refreshes.
 */
export async function markSettled(tripId: string, fromUserId: string, toUserId: string, amountCents: number, key: string): Promise<void> {
  const user = await requireUser(`/trips/${tripId}/money`);
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc('is_trip_member', { p_trip_id: tripId });
  if (isMember !== true) throw new Error('Only people on this trip can mark a payment.');
  if (typeof key !== 'string' || !UUID.test(key)) throw new Error('Reload the page and try again.');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) throw new Error('That is not an amount that can be marked paid.');
  if (fromUserId === toUserId) throw new Error('A payment needs two different people.');

  const { data: rows } = await supabase.from('trip_members').select('user_id').eq('trip_id', tripId);
  const memberIds = new Set((rows ?? []).map((r) => r.user_id as string));
  if (!memberIds.has(fromUserId) || !memberIds.has(toUserId)) throw new Error('Both people must be on this trip.');
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (user.id !== fromUserId && user.id !== toUserId && isPlanner !== true) throw new Error('Only the two people involved, or the planner, can mark this paid.');

  const { data: expenses } = await supabase.from('expenses').select('payer_user_id, amount_cents, split').eq('trip_id', tripId);
  const { data: settlements } = await supabase.from('settlements').select('from_user_id, to_user_id, amount_cents').eq('trip_id', tripId);
  const net = balances((expenses ?? []).map((e) => ({ ...e, split: e.split as Split })), settlements ?? []);
  const stillOwed = Math.min(-(net[fromUserId] ?? 0), net[toUserId] ?? 0);
  if (stillOwed <= 0 || amountCents > stillOwed) {
    revalidatePath(`/trips/${tripId}/money`);
    return;
  }

  const { error } = await supabase
    .from('settlements')
    .insert({ trip_id: tripId, from_user_id: fromUserId, to_user_id: toUserId, amount_cents: amountCents, settled_by: user.id, client_key: key });
  if (error && error.code !== UNIQUE_VIOLATION) throw new Error('We could not mark that paid.');
  revalidatePath(`/trips/${tripId}/money`);
}
