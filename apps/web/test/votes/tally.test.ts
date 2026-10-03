import { describe, expect, it } from 'vitest';
import { tally } from '@/lib/votes/tally';

const vote = { id: 'v1', trip_id: 't1', title: 'Which flight?', detail: 'TP cancelled us', deadline: null, status: 'open' as const };
const options = [
  { id: 'o1', label: '7:05 tomorrow', position: 1 },
  { id: 'o2', label: 'Tonight via Denver', position: 2 },
];

describe('tally', () => {
  it('counts votes, picks a leader, and knows when everyone required has voted', () => {
    const result = tally(vote, options, [
      { user_id: 'u1', option_id: 'o1' },
      { user_id: 'u2', option_id: 'o1' },
      { user_id: 'u3', option_id: 'o2' },
    ], ['u1', 'u2', 'u3']);
    expect(result.options).toEqual([
      { id: 'o1', label: '7:05 tomorrow', votes: 2 },
      { id: 'o2', label: 'Tonight via Denver', votes: 1 },
    ]);
    expect(result.leaderOptionId).toBe('o1');
    expect(result.complete).toBe(true);
    expect(result.requiredParticipantIds).toEqual(['u1', 'u2', 'u3']);
  });

  it('has no leader on a tie', () => {
    const result = tally(vote, options, [{ user_id: 'u1', option_id: 'o1' }, { user_id: 'u2', option_id: 'o2' }], ['u1', 'u2', 'u3']);
    expect(result.leaderOptionId).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.respondedCount).toBe(2);
  });
});
