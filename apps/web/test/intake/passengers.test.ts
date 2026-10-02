import { describe, expect, it } from 'vitest';
import { matchPassengers, splitName } from '@/lib/intake/passengers';

describe('splitName', () => {
  it('reads airline LAST/FIRST TITLE and plain forms', () => {
    expect(splitName('DOE/PAT MR')).toEqual({ first: 'pat', last: 'doe' });
    expect(splitName('Samantha Jones')).toEqual({ first: 'samantha', last: 'jones' });
  });
});

describe('matchPassengers', () => {
  const members = [
    { id: 'm-pat', display_name: 'Pat' },
    { id: 'm-sam', display_name: 'Sam Jones' },
    { id: 'm-jo', display_name: 'Jo' },
  ];

  it('matches nicknames by first-name prefix and full names exactly', () => {
    expect(matchPassengers(['DOE/PAT MR', 'JONES/SAMANTHA MS'], members)).toEqual({
      matched: { 'DOE/PAT MR': 'm-pat', 'JONES/SAMANTHA MS': 'm-sam' },
      unmatched: [],
    });
  });

  it('leaves ambiguous or unknown passengers for the planner', () => {
    const result = matchPassengers(['JO/ANNE', 'SMITH/TERRY'], [...members, { id: 'm-joanne', display_name: 'Joanne' }]);
    expect(result.unmatched).toEqual(['JO/ANNE', 'SMITH/TERRY']);
  });
});
