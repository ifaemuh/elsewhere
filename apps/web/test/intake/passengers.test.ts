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

  it('ignores diacritics', () => {
    expect(splitName('José Müller')).toEqual({ first: 'jose', last: 'muller' });
    expect(matchPassengers(['MULLER/JOSE MR'], [{ id: 'm1', display_name: 'José Müller' }]).matched).toEqual({ 'MULLER/JOSE MR': 'm1' });
  });

  it('does not match look-alike first names', () => {
    expect(matchPassengers(['LEE/SAMIRA'], [{ id: 's', display_name: 'Sam Lee' }]).unmatched).toEqual(['LEE/SAMIRA']);
    expect(matchPassengers(['LEE/ANNETTE'], [{ id: 'a', display_name: 'Ann Lee' }]).unmatched).toEqual(['LEE/ANNETTE']);
    expect(matchPassengers(['LEE/ANNE'], [{ id: 'a', display_name: 'Ann Lee' }]).matched).toEqual({ 'LEE/ANNE': 'a' });
  });

  it('never matches on an initial', () => {
    const two = [{ id: 'j1', display_name: 'James Jones' }, { id: 'j2', display_name: 'Jane Jones' }];
    expect(matchPassengers(['J Jones'], two).unmatched).toEqual(['J Jones']);
    expect(matchPassengers(['JONES/J'], [two[0]]).unmatched).toEqual(['JONES/J']);
  });

  it('matches a member without a last name only on an exact first name', () => {
    expect(matchPassengers(['LEE/SAMANTHA'], [{ id: 's', display_name: 'Sam' }]).unmatched).toEqual(['LEE/SAMANTHA']);
    expect(matchPassengers(['LEE/SAM'], [{ id: 's', display_name: 'Sam' }]).matched).toEqual({ 'LEE/SAM': 's' });
  });

  it('assigns each member once', () => {
    const result = matchPassengers(['DOE/PAT MR', 'DOE/PATRICK MR', 'ROE/ANN'], [{ id: 'p', display_name: 'Pat Doe' }, { id: 'a', display_name: 'Ann Roe' }]);
    expect(result).toEqual({ matched: { 'ROE/ANN': 'a' }, unmatched: ['DOE/PAT MR', 'DOE/PATRICK MR'] });
  });
});
