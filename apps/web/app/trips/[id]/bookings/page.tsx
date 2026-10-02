import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';
import { confirmBooking, toggleAssignment } from './actions';
import { CorrectFlightForm, ManualFlightForm, ScreenshotForm } from './forms';

type Params = Promise<{ id: string }>;

export default function BookingsPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading bookings…</p>}>
        <BookingsContent params={params} />
      </Suspense>
    </main>
  );
}

async function BookingsContent({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser(`/trips/${id}/bookings`);
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc('is_trip_member', { p_trip_id: id });
  if (isMember !== true) notFound();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: id });
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, kind, provider, booked_via, passenger_names, extraction_confidence, confirmed_at, booking_segments(id, position, carrier_iata, flight_number, origin_iata, destination_iata, departure_local, scheduled_out)')
    .eq('trip_id', id)
    .order('created_at');
  // Only the planner can read these, and only the planner can fix a flight that was not found.
  const { data: flagged } =
    isPlanner === true
      ? await supabase.from('action_items').select('related_entity_id').eq('trip_id', id).eq('source_kind', 'flight_not_found').in('status', ['open', 'snoozed'])
      : { data: [] };
  const needsCorrection = new Set((flagged ?? []).map((i) => i.related_entity_id as string));
  const { data: assignments } = await supabase.from('booking_members').select('booking_id, member_id, self_claimed').eq('trip_id', id);
  const { data: directory } = await supabase.rpc('trip_directory', { p_trip_id: id });
  const me = (directory ?? []).find((m: { user_id: string }) => m.user_id === user.id) as { member_id: string } | undefined;
  // Codes come one by one through the RLS-checked function; everyone else gets null.
  const codes: Record<string, string | null> = Object.fromEntries(
    await Promise.all(
      (bookings ?? []).map(async (b) => [b.id, ((await supabase.rpc('booking_confirmation_code', { p_booking_id: b.id })).data as string | null) ?? null] as const),
    ),
  );

  return (
    <>
      <ul className="mt-6 space-y-4">
        {(bookings ?? []).map((booking) => {
          const code = codes[booking.id];
          const onIt = new Set((assignments ?? []).filter((a) => a.booking_id === booking.id).map((a) => a.member_id));
          const waitingOnPlanner = (assignments ?? []).some((a) => a.booking_id === booking.id && a.member_id === me?.member_id && a.self_claimed === true);
          return (
            <li key={booking.id} className="rounded-xl border border-[#e4dfd0] bg-white p-5">
              <div className="flex items-baseline justify-between">
                <p className="font-semibold">
                  {booking.provider}
                  {code ? <span className="ml-2 font-mono text-sm text-[#4b5745]">{code}</span> : null}
                </p>
                <span className="text-sm text-[#4b5745]">{booking.confirmed_at ? 'Confirmed' : 'Waiting for the planner'}</span>
              </div>
              {waitingOnPlanner && !code ? <p className="text-sm text-[#4b5745]">The planner confirms who is on a booking before its code shows.</p> : null}
              {booking.booked_via ? <p className="text-sm text-[#4b5745]">Booked through {booking.booked_via}</p> : null}
              <ul className="mt-2 text-sm">
                {(booking.booking_segments ?? [])
                  .sort((a, b) => a.position - b.position)
                  .map((s) => (
                    <li key={s.id}>
                      {s.carrier_iata} {s.flight_number} · {s.origin_iata} → {s.destination_iata} · {s.departure_local.replace('T', ' ')}
                      {s.scheduled_out ? '' : ' · not yet matched to the schedule'}
                      {needsCorrection.has(s.id) ? (
                        <CorrectFlightForm
                          tripId={id}
                          segmentId={s.id}
                          defaults={{ flight: `${s.carrier_iata} ${s.flight_number}`, date: s.departure_local.slice(0, 10), time: s.departure_local.slice(11, 16), from: s.origin_iata, to: s.destination_iata }}
                        />
                      ) : null}
                    </li>
                  ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {(directory ?? []).map((member: { member_id: string; display_name: string; user_id: string }) => {
                  const canToggle = isPlanner === true || member.user_id === user.id;
                  const on = onIt.has(member.member_id);
                  return canToggle ? (
                    <form key={member.member_id} action={toggleAssignment.bind(null, id, booking.id, member.member_id, !on)}>
                      <Button type="submit" size="sm" variant={on ? 'default' : 'outline'}>
                        {member.display_name}
                      </Button>
                    </form>
                  ) : (
                    <span key={member.member_id} className={on ? 'font-medium' : 'text-[#4b5745]'}>
                      {member.display_name}
                    </span>
                  );
                })}
              </div>
              {isPlanner === true && !booking.confirmed_at ? (
                <form action={confirmBooking.bind(null, id, booking.id)} className="mt-3">
                  <Button type="submit" size="sm">
                    Confirm — start watching it
                  </Button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
      {me ? <ScreenshotForm tripId={id} /> : null}
      {isPlanner === true ? <ManualFlightForm tripId={id} members={directory ?? []} meId={me?.member_id ?? null} /> : null}
    </>
  );
}
