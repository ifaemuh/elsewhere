import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await getAuthUser(req);
    const { id } = await params;

    const { data: trip, error } = await supabase
      .from('trips')
      .select(`
        *,
        destination:destinations(*),
        travelers(*),
        quotes:trip_quotes(*)
      `)
      .eq('id', id)
      .single();

    if (error || !trip) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Trip not found', statusCode: 404 },
        { status: 404 },
      );
    }

    return NextResponse.json(trip);
  } catch (error) {
    return errorResponse(error);
  }
}
