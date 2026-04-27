import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);
    const since = req.nextUrl.searchParams.get('since');

    let query = supabase
      .from('financing_status_events')
      .select(`
        *,
        installment:wallet_installments(
          trip_id,
          traveler_id
        )
      `)
      .order('created_at', { ascending: true });

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
