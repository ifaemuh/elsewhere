import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';

interface DiscoverWatchState {
  cardId: string;
  watched: boolean;
  saved: boolean;
  watchId: string | null;
  message: string;
  monitoringSignals: string[];
  limitation: string;
}

const watchStates = new Map<string, DiscoverWatchState>();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const { user } = await getAuthUser(req);
    const { cardId } = await params;
    const body = await req.json().catch(() => ({}));
    const shouldWatch = body.watch !== false;
    const shouldSave = Boolean(body.saved ?? body.save ?? shouldWatch);
    const key = `${user.id}:${cardId}`;

    const previous = watchStates.get(key);
    const state: DiscoverWatchState = {
      cardId,
      watched: shouldWatch || previous?.watched === true,
      saved: shouldSave || previous?.saved === true,
      watchId: previous?.watchId ?? `watch-${cardId}-${Date.now()}`,
      message: shouldWatch
        ? 'Elsewhere is watching this trip for better dates, price drops, mistake fares, and booking-window changes.'
        : 'Saved to your watched ideas. Turn on monitoring when you want smart date and price alerts.',
      monitoringSignals: [
        'fare drops',
        'mistake fare corrections',
        'calendar-compatible dates',
        'hotel cancellation windows',
        'sponsored partner availability',
      ],
      limitation: 'Mock monitoring in local dev. Final book/change/cancel decisions still require official provider verification.',
    };

    watchStates.set(key, state);
    return NextResponse.json(state);
  } catch (error) {
    return errorResponse(error);
  }
}
