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
