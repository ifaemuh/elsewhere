import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/user';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { assignVariant, variantPriceLabel } from '@/lib/funnel/variant';
import { createClient } from '@/lib/supabase/server';
import { inboundAddress } from '@/lib/trips/inbound-code';
import { InviteSection } from './invite-section';
import { startPassCheckout } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ pass?: string; invite?: string }>;

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
  await requireUser(`/trips/${id}`);
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
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{trip.name}</h1>
      <p className="mt-1 text-[#4b5745]">
        {trip.start_date} → {trip.end_date} · {trip.destination_country}
      </p>
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
