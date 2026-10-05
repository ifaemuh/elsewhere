import { CHARACTERS } from '@elsewhere/rules/core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHARACTER_DIMENSIONS, CHARACTER_INFO, CHARACTER_NAMES, characterSrc } from '@/lib/characters';

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

  it('ships art at the dimensions the component assumes', () => {
    for (const character of CHARACTERS) {
      for (const variant of ['portrait', 'avatar'] as const) {
        const buf = readFileSync(path.join(publicDir, characterSrc(character, variant)));
        // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20.
        expect({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }).toEqual(CHARACTER_DIMENSIONS[variant]);
      }
    }
  });
});
