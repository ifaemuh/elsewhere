import 'server-only';
import { runDocumentChecks } from '@/lib/documents/service';
import { appUrl, requireEnv } from '@/lib/env';
import { aeroApi, type AeroFlight } from '@/lib/flights/aeroapi';
import { recordFlightSnapshot } from '@/lib/monitor/record';
import { flightEnded, snapshotFromAero } from '@/lib/monitor/snapshot';
import { queueNotifications } from '@/lib/notify/queue';
import { briefingNotice } from '@/lib/notify/templates';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MonitoredSegment, WorkflowPorts } from './ports';

function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

export function livePorts(): WorkflowPorts {
  const admin = createAdminClient();
  return {
    async listMonitorableSegmentIds(tripId) {
      const { data, error } = await admin
        .from('booking_segments')
        .select('id, bookings!inner(confirmed_at)')
        .eq('trip_id', tripId)
        .not('scheduled_out', 'is', null)
        .not('bookings.confirmed_at', 'is', null)
        // Ended segments are over: restarting them would repeat paid calls and undo their ended state.
        .neq('monitor_state', 'ended');
      if (error) throw new Error(error.message);
      return (data ?? []).map((s) => s.id as string);
    },
    async tripTiming(tripId) {
      const { data: trip, error } = await admin.from('trips').select('end_date').eq('id', tripId).single();
      if (error) throw new Error(error.message);
      const { data: first, error: firstError } = await admin.from('booking_segments').select('scheduled_out').eq('trip_id', tripId).not('scheduled_out', 'is', null).order('scheduled_out').limit(1).maybeSingle();
      if (firstError) throw new Error(firstError.message);
      return { firstDeparture: first?.scheduled_out ?? null, tripEnd: trip?.end_date ? `${trip.end_date}T23:59:59Z` : null };
    },
    async preTripChecks(tripId) {
      await runDocumentChecks(tripId);
      // A retry after a partial failure, or a restarted trip monitor, must not brief the group again.
      const { data: sent, error: sentError } = await admin.from('notifications').select('id').eq('trip_id', tripId).eq('template', 'briefing').limit(1);
      if (sentError) throw new Error(sentError.message);
      if ((sent ?? []).length > 0) return;
      const { data: trip, error } = await admin.from('trips').select('name').eq('id', tripId).single();
      if (error) throw new Error(error.message);
      const { data: members, error: membersError } = await admin.from('trip_members').select('user_id').eq('trip_id', tripId);
      if (membersError) throw new Error(membersError.message);
      await queueNotifications({
        userIds: (members ?? []).map((m) => m.user_id),
        tripId,
        template: 'briefing',
        rendered: briefingNotice({ tripName: trip?.name ?? 'Your trip', url: `${appUrl()}/trips/${tripId}` }),
        urgent: false,
      });
    },
    async loadSegment(segmentId) {
      const { data: s, error } = await admin
        .from('booking_segments')
        .select('id, trip_id, carrier_iata, flight_number, origin_iata, destination_iata, departure_local, scheduled_out, scheduled_in, aeroapi_alert_id, monitor_state')
        .eq('id', segmentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!s) return null;
      const segment: MonitoredSegment = {
        id: s.id,
        tripId: s.trip_id,
        ident: `${s.carrier_iata}${s.flight_number}`,
        departureDate: s.departure_local.slice(0, 10),
        originIata: s.origin_iata,
        destinationIata: s.destination_iata,
        scheduledOut: s.scheduled_out,
        scheduledIn: s.scheduled_in,
        alertId: s.aeroapi_alert_id,
        monitorState: s.monitor_state,
      };
      return segment;
    },
    async registerAlert(segment) {
      if (segment.alertId) return 'monitoring';
      let api: Awaited<ReturnType<typeof aeroApi>>;
      let alertId: string;
      try {
        // Built from the app's own configured URL, never from a request host. Missing settings, like AeroAPI
        // refusing the alert, leave the flight on polling, which needs neither the app URL nor the secret.
        const targetUrl = `${appUrl()}/api/webhooks/aeroapi/${requireEnv('AEROAPI_WEBHOOK_SECRET')}`;
        api = await aeroApi();
        alertId = await api.createAlert({ ident: segment.ident, origin: segment.originIata, destination: segment.destinationIata, date: segment.departureDate, targetUrl });
      } catch (error) {
        console.error('alert registration failed; polling only', segment.id, error instanceof Error ? error.message : 'unknown');
        check(await admin.from('booking_segments').update({ monitor_state: 'polling_only' }).eq('id', segment.id));
        return 'polling_only';
      }
      const saved = await admin.from('booking_segments').update({ aeroapi_alert_id: alertId, monitor_state: 'monitoring' }).eq('id', segment.id);
      if (saved.error) {
        // The alert exists at AeroAPI but we cannot remember it. Remove it so it is not orphaned, then let the step retry.
        try {
          await api.deleteAlert(alertId);
        } catch (e) {
          console.error('could not delete the orphaned alert', alertId, e instanceof Error ? e.message : 'unknown');
        }
        throw new Error(saved.error.message);
      }
      return 'monitoring';
    },
    async pollAndRecord(segmentId) {
      const { data: s, error } = await admin.from('booking_segments').select('carrier_iata, flight_number, scheduled_out').eq('id', segmentId).single();
      if (error) throw new Error(error.message);
      if (!s?.scheduled_out) return { incidentId: null, ended: false };
      const api = await aeroApi();
      const departure = new Date(s.scheduled_out);
      let flights: AeroFlight[];
      try {
        flights = await api.flights(
          `${s.carrier_iata}${s.flight_number}`,
          new Date(departure.getTime() - 12 * 3600_000).toISOString(),
          new Date(departure.getTime() + 36 * 3600_000).toISOString(),
        );
      } catch (e) {
        // AeroAPI is down or rate limiting: the workflow backs off and flags the segment if it persists.
        console.error('AeroAPI poll failed', segmentId, e instanceof Error ? e.message : 'unknown');
        return { incidentId: null, ended: false, failed: true };
      }
      const flight = flights.find((f) => f.scheduled_out && Math.abs(new Date(f.scheduled_out).getTime() - departure.getTime()) < 6 * 3600_000);
      if (!flight) return { incidentId: null, ended: false };
      const snapshot = snapshotFromAero(flight);
      const { incidentId } = await recordFlightSnapshot(segmentId, snapshot, 'poll');
      return { incidentId, ended: flightEnded(snapshot), latestArrival: snapshot.actualIn ?? snapshot.estimatedIn ?? snapshot.scheduledIn };
    },
    async endSegment(segmentId) {
      const { data: s, error } = await admin.from('booking_segments').select('aeroapi_alert_id').eq('id', segmentId).single();
      if (error) throw new Error(error.message);
      if (s?.aeroapi_alert_id) {
        try {
          await (await aeroApi()).deleteAlert(s.aeroapi_alert_id);
        } catch (e) {
          console.error('could not delete the alert', s.aeroapi_alert_id, e instanceof Error ? e.message : 'unknown');
        }
      }
      check(await admin.from('booking_segments').update({ monitor_state: 'ended' }).eq('id', segmentId));
    },
    async flagMonitorTrouble(segmentId) {
      // /admin lists polling_only flights for a manual check until they end (Task 16).
      console.error('AeroAPI polling keeps failing', segmentId);
      check(await admin.from('booking_segments').update({ monitor_state: 'polling_only' }).eq('id', segmentId));
    },
  };
}
