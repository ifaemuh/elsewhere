import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/admin/guard';
import { stuckIncidents, stuckMessages } from '@/lib/admin/sweep';
import { createAdminClient } from '@/lib/supabase/admin';
import { adminApproveQuarantined, compPass, releasePlaybook, rerunChecks, startIncidentRun, startIntakeRun, startMonitoring } from './actions';
import { PlaybookEditor } from './playbook-editor';

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Hand-run trips</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading…</p>}>
        <AdminContent />
      </Suspense>
    </main>
  );
}

/** A failed read must show as an error, not as an empty list that looks like "nothing needs doing". */
function rows<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

async function AdminContent() {
  // Before any read: the admin client below bypasses RLS.
  await requireAdmin();
  const admin = createAdminClient();
  const [tripRows, incidentRows, quarantinedRows, fallbackRows, stuckIncidentRows, stuckMessageRows] = await Promise.all([
    admin.from('trips').select('id, name, pass_status, hand_run, start_date, end_date').order('start_date', { ascending: true }).limit(200),
    admin.from('incidents').select('id, trip_id, event_type, status, detected_at').neq('status', 'resolved').order('detected_at', { ascending: false }).limit(50),
    admin.from('inbound_messages').select('id, trip_id, sender, subject').eq('status', 'quarantined').limit(50),
    admin.from('booking_segments').select('id, trip_id, carrier_iata, flight_number, departure_local').eq('monitor_state', 'polling_only').order('scheduled_out').limit(50),
    stuckIncidents(admin),
    stuckMessages(admin),
  ]);
  const trips = rows(tripRows);
  const incidents = rows(incidentRows);
  const quarantined = rows(quarantinedRows);
  const fallback = rows(fallbackRows);
  const playbooks = new Map<string, { content: unknown; held: boolean }>();
  for (const incident of incidents) {
    const { data, error } = await admin.from('playbooks').select('content, held_for_review').eq('incident_id', incident.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) playbooks.set(incident.id, { content: data.content, held: data.held_for_review === true });
  }

  return (
    <>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Trips</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-[#4b5745]">
              <th className="py-2">Trip</th>
              <th>Dates</th>
              <th>Pass</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => (
              <tr key={trip.id} className="border-t border-[#e4dfd0]">
                <td className="py-2">
                  <Link href={`/trips/${trip.id}`} className="underline">{trip.name}</Link>
                </td>
                <td>{trip.start_date} → {trip.end_date}</td>
                <td>
                  {trip.pass_status}
                  {trip.hand_run ? ' · hand-run' : ''}
                </td>
                <td className="flex gap-2 py-2">
                  {trip.pass_status === 'none' ? (
                    <form action={compPass.bind(null, trip.id)}>
                      <Button size="sm" variant="outline" type="submit">Comp and hand-run</Button>
                    </form>
                  ) : (
                    <form action={startMonitoring.bind(null, trip.id)}>
                      <Button size="sm" variant="outline" type="submit">Start monitoring</Button>
                    </form>
                  )}
                  <form action={rerunChecks.bind(null, trip.id)}>
                    <Button size="sm" variant="outline" type="submit">Re-run document checks</Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Open incidents</h2>
        {incidents.map((incident) => (
          <article key={incident.id} id={incident.id} className="mt-4 rounded-xl border border-[#e4dfd0] bg-white p-4">
            <p className="font-medium">
              {incident.event_type} · {incident.status} ·{' '}
              <Link href={`/trips/${incident.trip_id}/incidents/${incident.id}`} className="underline">open</Link>
            </p>
            {playbooks.has(incident.id) ? (
              <>
                <PlaybookEditor incidentId={incident.id} json={JSON.stringify(playbooks.get(incident.id)!.content, null, 2)} />
                {playbooks.get(incident.id)!.held ? (
                  <form action={releasePlaybook.bind(null, incident.id)} className="mt-2">
                    <Button size="sm" type="submit">Release to the group</Button>
                  </form>
                ) : null}
              </>
            ) : null}
          </article>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Runs that never started</h2>
        <p className="mt-1 text-sm text-[#4b5745]">
          Open incidents with no notice sent, and forwarded mail nobody claimed, both over an hour old. A daily job starts these too. Starting one that is already running does nothing.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {stuckIncidentRows.map((incident) => (
            <li key={incident.id} className="flex items-center justify-between rounded-lg border border-[#e4dfd0] bg-white p-3">
              <span>
                Incident: {incident.event_type} · {incident.status} · {incident.detected_at.replace('T', ' ').slice(0, 16)} UTC ·{' '}
                <Link href={`/trips/${incident.trip_id}/incidents/${incident.id}`} className="underline">open</Link>
              </span>
              <form action={startIncidentRun.bind(null, incident.id)}>
                <Button size="sm" variant="outline" type="submit">Start</Button>
              </form>
            </li>
          ))}
          {stuckMessageRows.map((message) => (
            <li key={message.id} className="flex items-center justify-between rounded-lg border border-[#e4dfd0] bg-white p-3">
              <span>Mail: {message.sender ?? 'unknown'} · {message.subject ?? 'no subject'} · {message.received_at.replace('T', ' ').slice(0, 16)} UTC</span>
              <form action={startIntakeRun.bind(null, message.id)}>
                <Button size="sm" variant="outline" type="submit">Start</Button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Flights on fallback watching</h2>
        <p className="mt-1 text-sm text-[#4b5745]">AeroAPI alerts could not be registered, or polling kept failing. Check these flights by hand until they end.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {fallback.map((segment) => (
            <li key={segment.id} className="rounded-lg border border-[#e4dfd0] bg-white p-3">
              <Link href={`/trips/${segment.trip_id}`} className="underline">
                {segment.carrier_iata} {segment.flight_number}
              </Link>{' '}
              · {segment.departure_local.replace('T', ' ')}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Quarantined mail</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {quarantined.map((message) => (
            <li key={message.id} className="flex items-center justify-between rounded-lg border border-[#e4dfd0] bg-white p-3">
              <span>{message.sender ?? 'unknown'} · {message.subject}</span>
              <form action={adminApproveQuarantined.bind(null, message.id)}>
                <Button size="sm" variant="outline" type="submit">Approve</Button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
