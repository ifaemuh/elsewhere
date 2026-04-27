import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);

    const { data: trips, error } = await supabase
      .from('trips')
      .select('*, destination:destinations(name, country)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch trips', message: error.message, statusCode: 500 },
        { status: 500 },
      );
    }

    return NextResponse.json(trips);
  } catch (error) {
    return errorResponse(error);
  }
}
