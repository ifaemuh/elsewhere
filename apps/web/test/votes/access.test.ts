import { describe, expect, it } from 'vitest';
import { canStartIncidentVote } from '@/lib/votes/access';

// The incident page runs the paid schedule lookup only when this is true.
describe('canStartIncidentVote', () => {
  it('allows the planner and an affected traveler, nobody else', () => {
    expect(canStartIncidentVote(true, [], 'u1')).toBe(true);
    expect(canStartIncidentVote(false, ['u1', 'u2'], 'u1')).toBe(true);
    expect(canStartIncidentVote(false, ['u2'], 'u1')).toBe(false);
    expect(canStartIncidentVote(false, null, 'u1')).toBe(false);
  });
});
