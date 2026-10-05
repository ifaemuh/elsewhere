// Contracts kept from the archived trip room:
// archive/mobile-expo-2026-10:packages/shared/src/types/trip-room.ts
export interface TripVoteOption {
  id: string;
  label: string;
  votes: number;
}

export interface TripVote {
  id: string;
  tripId: string;
  title: string;
  detail: string;
  options: TripVoteOption[];
  requiredParticipantIds: string[];
  deadline: string | null;
  status: 'open' | 'closed';
}
