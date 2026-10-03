import type { TripVote } from '@/lib/types/trip-room';

export function tally(
  vote: { id: string; trip_id: string; title: string; detail: string; deadline: string | null; status: 'open' | 'closed' },
  options: { id: string; label: string; position: number }[],
  responses: { user_id: string; option_id: string }[],
  requiredUserIds: string[],
): TripVote & { leaderOptionId: string | null; respondedCount: number; complete: boolean } {
  const counted = [...options]
    .sort((a, b) => a.position - b.position)
    .map((option) => ({ id: option.id, label: option.label, votes: responses.filter((r) => r.option_id === option.id).length }));
  const top = Math.max(0, ...counted.map((o) => o.votes));
  const leaders = counted.filter((o) => o.votes === top && top > 0);
  const responded = new Set(responses.map((r) => r.user_id));
  return {
    id: vote.id,
    tripId: vote.trip_id,
    title: vote.title,
    detail: vote.detail,
    options: counted,
    requiredParticipantIds: requiredUserIds,
    deadline: vote.deadline,
    status: vote.status,
    leaderOptionId: leaders.length === 1 ? leaders[0].id : null,
    respondedCount: responded.size,
    complete: requiredUserIds.length > 0 && requiredUserIds.every((id) => responded.has(id)),
  };
}
