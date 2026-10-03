import { randomUUID } from 'node:crypto';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/user';
import { cashAppLink, isCashtag, isVenmoUsername, venmoLink } from '@/lib/expenses/pay-links';
import { balances, minimalTransfers, type Split } from '@/lib/expenses/settle';
import { createClient } from '@/lib/supabase/server';
import { markSettled } from './actions';
import { ExpenseForm } from './expense-form';

type Params = Promise<{ id: string }>;
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function MoneyPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Who owes what</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading…</p>}>
        <MoneyContent params={params} />
      </Suspense>
    </main>
  );
}

async function MoneyContent({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser(`/trips/${id}/money`);
  const supabase = await createClient();
  const { data: trip } = await supabase.from('trips').select('name').eq('id', id).maybeSingle();
  if (!trip) notFound();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: id });
  // trip_directory is the only way to read a member's pay handles; it answers members of this trip only.
  const { data: directory } = await supabase.rpc('trip_directory', { p_trip_id: id });
  const members = (directory ?? []) as { user_id: string; display_name: string; venmo_username: string | null; cashtag: string | null }[];
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const { data: expenses } = await supabase.from('expenses').select('id, payer_user_id, amount_cents, description, split, created_at').eq('trip_id', id).order('created_at');
  const { data: settlements } = await supabase.from('settlements').select('from_user_id, to_user_id, amount_cents').eq('trip_id', id);
  const transfers = minimalTransfers(balances((expenses ?? []).map((e) => ({ ...e, split: e.split as Split })), settlements ?? []));
  // Fresh keys on each render: two clicks of one form (one key) record one expense or payment.
  const formKey = randomUUID();

  return (
    <>
      <p className="mt-2 text-[#4b5745]">Nothing moves through Elsewhere. Pay each other however you like, then mark it paid.</p>
      <section className="mt-6">
        <h2 className="text-xl font-semibold">To settle up</h2>
        {transfers.length === 0 ? (
          <p className="mt-2 text-[#4b5745]">Everyone is square.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#e4dfd0] rounded-xl border border-[#e4dfd0] bg-white">
            {transfers.map((t) => {
              const to = members.find((m) => m.user_id === t.to);
              return (
                <li key={`${t.from}-${t.to}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    {names.get(t.from) ?? 'Someone'} → {names.get(t.to) ?? 'someone'}: <strong>{usd.format(t.amountCents / 100)}</strong>
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    {t.from === user.id && isVenmoUsername(to?.venmo_username) ? (
                      <a href={venmoLink(to.venmo_username, t.amountCents, trip.name)} className="underline" rel="noopener noreferrer">
                        Venmo
                      </a>
                    ) : null}
                    {t.from === user.id && isCashtag(to?.cashtag) ? (
                      <a href={cashAppLink(to.cashtag)} className="underline" rel="noopener noreferrer">
                        Cash App ({usd.format(t.amountCents / 100)})
                      </a>
                    ) : null}
                    {t.from === user.id || t.to === user.id || isPlanner === true ? (
                      <form action={markSettled.bind(null, id, t.from, t.to, t.amountCents, randomUUID())}>
                        <Button type="submit" size="sm" variant="outline">
                          Mark paid
                        </Button>
                      </form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Expenses</h2>
        <ul className="mt-3 divide-y divide-[#e4dfd0] rounded-xl border border-[#e4dfd0] bg-white text-sm">
          {(expenses ?? []).map((e) => (
            <li key={e.id} className="flex justify-between px-4 py-3">
              <span>
                {e.description} · paid by {names.get(e.payer_user_id) ?? 'someone'}
              </span>
              <span>{usd.format(e.amount_cents / 100)}</span>
            </li>
          ))}
        </ul>
      </section>
      <ExpenseForm tripId={id} formKey={formKey} members={members} />
    </>
  );
}
