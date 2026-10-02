import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { LibraryLoadError, parseLibrary } from '@/lib/rules/parse-library';

describe('parseLibrary', () => {
  it('accepts a schema_version 1 library', () => {
    expect(parseLibrary(fixture).rules).toHaveLength(8);
  });

  it('rejects other schema versions', () => {
    expect(() => parseLibrary({ ...fixture, schema_version: 2 })).toThrow(LibraryLoadError);
  });
});

describe('parseLibrary rule and source validation', () => {
  const rules = fixture.rules as Record<string, unknown>[];
  const withRule = (rule: Record<string, unknown>) => ({ ...fixture, rules: [rule, ...rules.slice(1)] });

  it('rejects a rule missing history and names it', () => {
    const { history: _history, ...rest } = rules[0];
    expect(() => parseLibrary(withRule(rest))).toThrow(/fixture-card-trip-delay.*history/);
  });

  it('rejects an unknown domain', () => {
    expect(() => parseLibrary(withRule({ ...rules[0], domain: 'cruises' }))).toThrow(/fixture-card-trip-delay.*domain/);
  });

  it('rejects a bad source detector and names the source', () => {
    const sources = { ...fixture.sources, 'fixture-regulation': { ...fixture.sources['fixture-regulation'], detector: { nope: true } } };
    expect(() => parseLibrary({ ...fixture, sources })).toThrow(/fixture-regulation/);
  });

  it('defaults sources to {} when absent', () => {
    const { sources: _sources, ...noSources } = fixture;
    expect(parseLibrary(noSources).sources).toEqual({});
  });
});
