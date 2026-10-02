// C1's test/rules/parse-library.test.ts covers parseLibrary's validation. This file covers what it
// does not: that D's fakes are schema-valid and survive the real loader, and that the D-only
// global mocks route @/lib/rules/library to the test holder.
import { describe, expect, it } from 'vitest';
import { getLibrary, LibraryLoadError } from '@/lib/rules/library';
import { LibraryLoadError as RealLoadError, parseLibrary } from '@/lib/rules/parse-library';
import { setLibrary } from '../helpers/library-holder';
import { fixtureRule, goldenCases, makeLibrary, makeRule, standardChanges, standardLibrary, standardRules } from '../helpers/fixture-library';

describe('library fakes pass the real loader', () => {
  it('round-trips the standard library through parseLibrary unchanged', () => {
    const lib = standardLibrary();
    expect(parseLibrary(JSON.parse(JSON.stringify(lib)))).toEqual(lib);
  });

  it('keeps one rule per status, including draft and retired', () => {
    expect(standardLibrary().rules.map((r) => r.status).sort()).toEqual(['draft', 'needs_review', 'retired', 'verified']);
  });

  it('derives changes from history, newest first, and exposes them as standardChanges', () => {
    const lib = standardLibrary();
    expect(lib.changes).toEqual(standardChanges());
    const dates = lib.changes.map((c) => c.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(lib.changes[0]).toMatchObject({ rule_id: 'test-tarmac-delay', from_version: 1, to_version: 2, to_status: 'needs_review' });
  });

  it('makeRule derives a history ending at the overridden version and status', () => {
    const rule = makeRule({ status: 'needs_review', version: 3 });
    expect(rule.history.at(-1)).toMatchObject({ version: 3, status: 'needs_review' });
  });

  it('makeLibrary includes a source entry for every cited source', () => {
    const lib = makeLibrary(standardRules());
    expect(Object.keys(lib.sources)).toEqual(['test-source']);
  });

  it('loads the shared golden cases and fixture rules', () => {
    const cases = goldenCases();
    expect(cases.length).toBeGreaterThan(0);
    expect(fixtureRule('fx-24h-free-cancellation').status).toBe('verified');
  });
});

describe('rules-api project mock of @/lib/rules/library', () => {
  it('throws LibraryLoadError (the real class) until a library is set', () => {
    expect(() => getLibrary()).toThrow(LibraryLoadError);
    expect(LibraryLoadError).toBe(RealLoadError);
  });

  it('returns the library set by setLibrary', () => {
    const lib = standardLibrary();
    setLibrary(lib);
    expect(getLibrary()).toBe(lib);
  });

  it('is reset between tests', () => {
    expect(() => getLibrary()).toThrow(LibraryLoadError);
  });
});
