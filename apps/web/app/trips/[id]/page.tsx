import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';
import { inboundAddress } from '@/lib/trips/inbound-code';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ pass?: string }>;

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
  await searchParams;
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
    </>
  );
}
