import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { TripRoomData } from '@elsewhere/shared';

export function useTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trips', tripId],
    queryFn: () => api.getTrip(tripId!),
    enabled: !!tripId,
  });
}

export function useTrips() {
  return useQuery({
    queryKey: ['trips', 'list'],
    queryFn: () => api.listTrips(),
  });
}

export function useTripGuide(tripId: string | undefined) {
  return useQuery({
    queryKey: ['assist', 'trip-guide', tripId],
    queryFn: () => api.getTripGuide(tripId!),
    enabled: !!tripId,
  });
}

export function useTripGuides() {
  return useQuery({
    queryKey: ['assist', 'trip-guides'],
    queryFn: () => api.listTripGuides(),
  });
}

export function useLiveTripIntelligence(tripId: string | undefined) {
  return useQuery({
    queryKey: ['assist', 'live-intel', tripId],
    queryFn: () => api.getLiveTripIntelligence(tripId!),
    enabled: !!tripId,
    refetchInterval: 60_000,
  });
}

export function useDealRadar(tripId?: string) {
  return useQuery({
    queryKey: ['assist', 'deal-radar', tripId ?? 'global'],
    queryFn: () => api.getDealRadar(tripId),
    refetchInterval: 5 * 60_000,
  });
}

export function useTripRoom(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trips', tripId, 'room'],
    queryFn: async (): Promise<TripRoomData> => {
      const [
        feed,
        schedule,
        suggestions,
        votes,
        actionItems,
        paymentSummary,
        media,
        chatProvider,
        chatSuggestions,
        messages,
        notifications,
      ] = await Promise.all([
        api.getTripFeed(tripId!),
        api.getTripSchedule(tripId!),
        api.getTripPlannerSuggestions(tripId!),
        api.getTripVotes(tripId!),
        api.getTripActionItems(tripId!),
        api.getTripPaymentSummary(tripId!),
        api.getTripMedia(tripId!),
        api.getTripChatProvider(tripId!),
        api.getTripChatSuggestions(tripId!),
        api.getTripMessages(tripId!),
        api.getTripNotifications(tripId!),
      ]);

      return {
        feed,
        schedule,
        suggestions,
        votes,
        actionItems,
        paymentSummary,
        media: media.items,
        chatProvider,
        chatSuggestions,
        messages,
        notifications,
      };
    },
    enabled: !!tripId,
  });
}
