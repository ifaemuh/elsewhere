import { timingSafeEqual } from 'node:crypto';
import type { AeroFlight } from '@/lib/flights/aeroapi';
import { recordFlightSnapshot } from '@/lib/monitor/record';
import { snapshotFromAero } from '@/lib/monitor/snapshot';
import { createAdminClient } from '@/lib/supabase/admin';

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
    return Response.json({ incidentId });
  } catch (error) {
    // Release the dedupe claim so AeroAPI's retry of this delivery is processed instead of dropped as a duplicate.
    await admin.from('webhook_events').delete().eq('provider', 'aeroapi').eq('event_id', eventId);
    throw error;
  }
}
