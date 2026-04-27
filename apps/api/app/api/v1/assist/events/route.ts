import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);
    const since = req.nextUrl.searchParams.get('since');

    // Get user's trips, then their disruption events
    const { data: trips } = await supabase
      .from('trips')
      .select('id')
      .in('status', ['booked', 'in_progress']);

    if (!trips?.length) {
      return NextResponse.json([]);
    }

    const tripIds = trips.map((t) => t.id);

    let query = supabase
      .from('assist_disruption_events')
      .select('*')
      .in('trip_id', tripIds)
      .order('occurred_at', { ascending: false });

    if (since) {
      query = query.gte('created_at', since);
    }

    const { data: events, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch events', message: error.message, statusCode: 500 },
        { status: 500 },
      );
    }

    return NextResponse.json(events);
  } catch (error) {
    return errorResponse(error);
  }
}
