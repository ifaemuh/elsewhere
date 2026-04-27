import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

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
