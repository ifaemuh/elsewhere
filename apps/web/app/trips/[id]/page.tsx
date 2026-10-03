import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Character } from '@/components/character';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/user';
import { balances, type Split } from '@/lib/expenses/settle';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { assignVariant, variantPriceLabel } from '@/lib/funnel/variant';
import { createClient } from '@/lib/supabase/server';
import { buildFeed, isAllClear, type FeedCard } from '@/lib/trips/feed';
import { inboundAddress } from '@/lib/trips/inbound-code';
import { InviteSection } from './invite-section';
import { startPassCheckout } from './actions';
import { approveQuarantinedMail } from './feed-actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ pass?: string; invite?: string }>;

// Task 9 records a diversion as a delay whose length isn't known yet.
const summaryFor = (row: { event_type: string; delay_minutes: number | null }) =>
  row.event_type === 'cancellation'
    ? 'A flight was cancelled.'
    : row.event_type === 'delay'
      ? row.delay_minutes === null
        ? 'A flight was diverted.'
        : `A flight is running ${Math.floor(row.delay_minutes / 60)} h late.`
      : 'A flight changed.';

export default function TripPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Suspense fallback={<p className="text-[#4b5745]">Loading the trip…</p>}>
        <TripContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function TripContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const { pass, invite } = await searchParams;
  const user = await requireUser(`/trips/${id}`);
  const supabase = await createClient();
  // inbound_code and join_token_hash are not column-readable; never select * from trips.
  const { data: trip } = await supabase
    .from('trips')
    .select('id, name, destination_country, start_date, end_date, pass_status')
    .eq('id', id)
    .maybeSingle();
  if (!trip) notFound();
  // Only the planner gets a code back; a member sees null and no forwarding address.
  const { data: code, error: codeError } = await supabase.rpc('trip_inbound_code', { p_trip_id: trip.id });
  if (codeError) console.error('trip_inbound_code failed', codeError.message);
  const domain = process.env.INBOUND_DOMAIN;
  if (!domain) console.error('INBOUND_DOMAIN is not set');
  const address = typeof code === 'string' && domain ? inboundAddress(code, domain) : null;
  const addressFailed = Boolean(codeError) || (typeof code === 'string' && !domain);
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: trip.id });

  // Every read goes through the user's client, so RLS decides what this person may see.
  const [{ data: actionItems }, { data: incidents }, { data: votes }, { data: myResponses }, { data: segments }, { data: expenses }, { data: settlements }] = await Promise.all([
    supabase.from('action_items').select('id, title, detail, source_kind, related_entity_id, assigned_user_ids').eq('trip_id', id).eq('status', 'open'),
    supabase.from('incidents').select('id, status, event_type, delay_minutes').eq('trip_id', id).neq('status', 'resolved').order('detected_at', { ascending: false }),
    supabase.from('votes').select('id, title, status, required_user_ids').eq('trip_id', id).eq('status', 'open'),
    supabase.from('vote_responses').select('vote_id').eq('user_id', user.id),
    supabase.from('booking_segments').select('carrier_iata, flight_number, origin_iata, destination_iata, departure_local').eq('trip_id', id).gt('scheduled_out', new Date().toISOString()).order('scheduled_out').limit(1),
    supabase.from('expenses').select('payer_user_id, amount_cents, split').eq('trip_id', id),
    supabase.from('settlements').select('from_user_id, to_user_id, amount_cents').eq('trip_id', id),
  ]);
  const cards = buildFeed({
    tripId: id,
    meId: user.id,
    isPlanner: isPlanner === true,
    actionItems: actionItems ?? [],
    incidents: (incidents ?? []).map((i) => ({ id: i.id, status: i.status, summary: summaryFor(i) })),
    votes: votes ?? [],
    myVoteIds: (myResponses ?? []).map((r) => r.vote_id),
    nextSegment: segments?.[0] ?? null,
    myNetCents: balances((expenses ?? []).map((e) => ({ ...e, split: e.split as Split })), settlements ?? [])[user.id] ?? 0,
  });

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{trip.name}</h1>
      <p className="mt-1 text-[#4b5745]">
        {trip.start_date} → {trip.end_date} · {trip.destination_country}
      </p>
      <nav className="mt-4 flex flex-wrap gap-4 text-sm">
        <Link href={`/trips/${id}/bookings`} className="underline">Bookings</Link>
        <Link href={`/trips/${id}/documents`} className="underline">Documents</Link>
        <Link href={`/trips/${id}/money`} className="underline">Who owes what</Link>
        <Link href={`/trips/${id}/members`} className="underline">Members</Link>
      </nav>

      {isAllClear(cards) ? (
        <section className="mt-8 flex items-center gap-4 rounded-xl border border-[#cfe3c8] bg-[#f1f8ee] p-5">
          <Character character="capybara" variant="avatar" width={56} />
          <p>Nothing needs doing right now.</p>
        </section>
      ) : null}
      <ul className="mt-6 space-y-3">
        {cards.map((card) => (
          <FeedItem key={`${card.kind}:${card.id}`} card={card} tripId={id} />
        ))}
      </ul>
      {address ? (
        <section className="mt-8 rounded-xl border border-[#e4dfd0] bg-white p-6">
          <h2 className="font-semibold">Forward the bookings here</h2>
          <p className="mt-2 break-all font-mono text-lg">{address}</p>
          <p className="mt-2 text-sm text-[#4b5745]">
            Forward flight, hotel, and rental confirmations from the email address you signed in with.
          </p>
        </section>
      ) : addressFailed ? (
        <p role="alert" className="mt-8 text-sm text-[#4b5745]">
          We couldn’t load your forwarding address. Refresh the page to try again.
        </p>
      ) : null}
      <InviteSection tripId={trip.id} isPlanner={isPlanner === true} failed={invite === 'failed'} />
      <PassSection tripId={trip.id} passStatus={trip.pass_status} justPaid={pass === 'success'} isPlanner={isPlanner === true} />
    </>
  );
}

function FeedItem({ card, tripId }: { card: FeedCard; tripId: string }) {
  const tone = card.kind === 'incident' && card.urgent ? 'border-[#e7c37a] bg-[#fdf3dc]' : 'border-[#e4dfd0] bg-white';
  if (card.kind === 'quarantine') {
    return (
      <li className="rounded-xl border border-[#e4dfd0] bg-white p-4">
        <p className="font-medium">{card.title}</p>
        <p className="mt-1 text-sm text-[#4b5745]">{card.detail}</p>
        <form action={approveQuarantinedMail.bind(null, tripId, card.messageId)} className="mt-3">
          <Button type="submit" size="sm" variant="outline">Approve and read it</Button>
        </form>
      </li>
    );
  }
  const body = (
    <>
      <p className="font-medium">{card.title}</p>
      {'detail' in card && card.detail ? <p className="mt-1 text-sm text-[#4b5745]">{card.detail}</p> : null}
    </>
  );
  const href = 'href' in card ? card.href : null;
  return (
    <li className={`rounded-xl border p-4 ${tone}`}>
      {href ? <Link href={href} className="block">{body}</Link> : body}
    </li>
  );
}

async function PassSection({
  tripId,
  passStatus,
  justPaid,
  isPlanner,
}: {
  tripId: string;
  passStatus: 'none' | 'active' | 'comp';
  justPaid: boolean;
  isPlanner: boolean;
}) {
  if (passStatus !== 'none') {
    return (
      <section className="mt-6 rounded-xl border border-[#cfe3c8] bg-[#f1f8ee] p-6">
        <h2 className="font-semibold">Trip pass active</h2>
        <p className="mt-1 text-sm text-[#4b5745]">We’re watching every confirmed flight for the group.</p>
      </section>
    );
  }
  if (justPaid) {
    return (
      <section role="status" className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-6">
        Payment received. Turning on the trip pass — refresh in a moment.
      </section>
    );
  }
  if (!isPlanner) {
    return (
      <section className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-6">
        <h2 className="font-semibold">Watch this trip</h2>
        <p className="mt-1 text-sm text-[#4b5745]">The trip planner can turn on the trip pass for the whole group.</p>
      </section>
    );
  }
  const anonymousId = (await cookies()).get(ANONYMOUS_ID_COOKIE)?.value;
  const price = variantPriceLabel(isAnonymousId(anonymousId) ? assignVariant(anonymousId) : 'p19');
  return (
    <section className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Watch this trip</h2>
      <p className="mt-1 text-sm text-[#4b5745]">
        One {price} pass covers the whole group: flight watching, cited playbooks, and group alerts. We draft the messages; you send them.
      </p>
      <form action={startPassCheckout.bind(null, tripId)} className="mt-4">
        <Button type="submit">Get the trip pass — {price}</Button>
      </form>
    </section>
  );
}
