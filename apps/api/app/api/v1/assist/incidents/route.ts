import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);

    // Get user's trips
    const { data: trips } = await supabase
      .from('trips')
      .select('id')
      .in('status', ['booked', 'in_progress']);

    if (!trips?.length) {
      return NextResponse.json([]);
    }

    const tripIds = trips.map((t) => t.id);

    const { data: incidents, error } = await supabase
      .from('assist_incidents')
      .select(`
        *,
        event:assist_disruption_events(*),
        timeline:assist_timeline(*),
        recommendations:assist_action_recommendations(*)
      `)
      .in('trip_id', tripIds)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch incidents', message: error.message, statusCode: 500 },
        { status: 500 },
      );
    }

    return NextResponse.json(incidents);
  } catch (error) {
    return errorResponse(error);
  }
}

// Resolve an incident manually
export async function POST(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);
    const { incidentId, action } = await req.json();

    if (!incidentId) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'incidentId is required', statusCode: 400 },
        { status: 400 },
      );
    }

    if (action === 'resolve') {
      await supabase
        .from('assist_incidents')
        .update({
          resolution_state: 'auto_resolved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', incidentId);

      await supabase.from('assist_timeline').insert({
        incident_id: incidentId,
        entry_type: 'executed_action',
        title: 'Manually resolved',
        detail: 'Incident marked as resolved by user.',
      });
    } else if (action === 'escalate') {
      await supabase
        .from('assist_incidents')
        .update({
          resolution_state: 'escalation_prepared',
          updated_at: new Date().toISOString(),
        })
        .eq('id', incidentId);

      await supabase.from('assist_timeline').insert({
        incident_id: incidentId,
        entry_type: 'executed_action',
        title: 'Escalated by user',
        detail: 'User requested escalation to support team.',
      });
    }

    return NextResponse.json({ status: 'ok', incidentId });
  } catch (error) {
    return errorResponse(error);
  }
}
