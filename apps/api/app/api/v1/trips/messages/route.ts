import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { sendMessageRequestSchema } from '@elsewhere/shared';
import { errorResponse } from '@lib/utils/errors';

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(req);
    const body = await req.json();
    const validated = sendMessageRequestSchema.parse(body);

    // Get user's display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const { data: message, error } = await supabase
      .from('trip_room_messages')
      .insert({
        trip_id: validated.tripId,
        author_id: user.id,
        author_name: profile?.display_name ?? 'Traveler',
        author_type: 'traveler',
        text: validated.text,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to send message', message: error.message, statusCode: 500 },
        { status: 500 },
      );
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);
    const tripId = req.nextUrl.searchParams.get('tripId');

    if (!tripId) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'tripId is required', statusCode: 400 },
        { status: 400 },
      );
    }

    const { data: messages, error } = await supabase
      .from('trip_room_messages')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch messages', message: error.message, statusCode: 500 },
        { status: 500 },
      );
    }

    return NextResponse.json(messages);
  } catch (error) {
    return errorResponse(error);
  }
}
