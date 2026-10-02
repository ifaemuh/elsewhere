import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Character } from '@elsewhere/rules/core';
import { characterSrc, type CharacterVariant } from '@/lib/characters';

/** next/og cannot fetch relative URLs, so character art is inlined as a data URL. */
export async function characterDataUrl(character: Character, variant: CharacterVariant = 'portrait'): Promise<string> {
  const file = path.join(process.cwd(), 'public', characterSrc(character, variant));
  return `data:image/png;base64,${await readFile(file, 'base64')}`;
}
