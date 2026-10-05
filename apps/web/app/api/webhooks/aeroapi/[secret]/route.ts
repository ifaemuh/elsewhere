import { timingSafeEqual } from 'node:crypto';
import { start } from 'workflow/api';
import type { AeroFlight } from '@/lib/flights/aeroapi';
import { recordFlightSnapshot } from '@/lib/monitor/record';
import { snapshotFromAero } from '@/lib/monitor/snapshot';
import { createAdminClient } from '@/lib/supabase/admin';
import { incidentWorkflow } from '@/workflows/incident';

function secretMatches(given: string): boolean {
  const expected = Buffer.from(process.env.AEROAPI_WEBHOOK_SECRET ?? '');
  const actual = Buffer.from(given);
  return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

interface AlertBody {
  alert_id: number | string;
  event_code: string;
  flight: AeroFlight;
}

function readBody(value: unknown): AlertBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const flight = body.flight as Record<string, unknown> | null | undefined;
  const validId = typeof body.alert_id === 'number' || (typeof body.alert_id === 'string' && body.alert_id.length > 0);
  if (!validId || typeof body.event_code !== 'string' || !flight || typeof flight !== 'object' || typeof flight.fa_flight_id !== 'string') return null;
  return body as unknown as AlertBody;
}

export async function POST(request: Request, { params }: { params: Promise<{ secret: string }> }): Promise<Response> {
  if (!secretMatches((await params).secret)) return new Response('not found', { status: 404 });
  const body = readBody(await request.json().catch(() => null));
  if (!body) return new Response('bad request', { status: 400 });
  const admin = createAdminClient();
  const eventId = `${body.alert_id}:${body.event_code}:${body.flight.fa_flight_id}:${body.flight.estimated_in ?? body.flight.scheduled_in ?? ''}:${body.flight.cancelled}`;
  const { error: duplicate } = await admin.from('webhook_events').insert({ provider: 'aeroapi', event_id: eventId });
  if (duplicate?.code === '23505') return Response.json({ duplicate: eventId });
  if (duplicate) throw new Error(duplicate.message);

  try {
    const { data: segment, error } = await admin.from('booking_segments').select('id').eq('aeroapi_alert_id', String(body.alert_id)).maybeSingle();
    if (error) throw new Error(error.message);
    if (!segment) return Response.json({ ignored: 'unknown alert' });
    const { incidentId } = await recordFlightSnapshot(segment.id, snapshotFromAero(body.flight), 'alert');
    if (incidentId) {
      try {
        await start(incidentWorkflow, [incidentId]);
      } catch (error) {
        // The alert is recorded and deduped, so AeroAPI won't resend it. The segment's next poll starts every
        // incident that was never notified, this one included.
        console.error('incident workflow did not start', incidentId, error);
      }
    }
    return Response.json({ incidentId });
  } catch (error) {
    // Release the dedupe claim so AeroAPI's retry of this delivery is processed instead of dropped as a duplicate.
    const { error: releaseError } = await admin.from('webhook_events').delete().eq('provider', 'aeroapi').eq('event_id', eventId);
    if (releaseError) console.error('could not release the aeroapi delivery claim', eventId, releaseError.message);
    throw error;
  }
}
