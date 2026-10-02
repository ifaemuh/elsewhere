import { CHARACTERS } from '@elsewhere/rules/core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTER_INFO, CHARACTER_NAMES, characterSrc } from '@/lib/characters';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

describe('characters', () => {
  it('names every character in the contract', () => {
    expect(Object.keys(CHARACTER_INFO).sort()).toEqual([...CHARACTERS].sort());
    expect([...CHARACTER_NAMES].sort()).toEqual([...CHARACTERS].sort());
  });

  it('points at a portrait and an avatar that exist on disk', () => {
    for (const character of CHARACTERS) {
      expect(existsSync(path.join(publicDir, characterSrc(character)))).toBe(true);
      expect(existsSync(path.join(publicDir, characterSrc(character, 'avatar')))).toBe(true);
    }
  });
});
