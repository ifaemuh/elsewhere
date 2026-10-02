import 'server-only';
import { readFile } from 'node:fs/promises';
import type { Character } from '@elsewhere/rules/core';
import type { CharacterVariant } from '@/lib/characters';

// Literal new URL(..., import.meta.url) expressions are what the bundler traces into the
// deployed function; a computed path would not be. Keep one literal per file.
const FILES: Record<CharacterVariant, Record<Character, URL>> = {
  portrait: {
    capybara: new URL('../../public/characters/capybara.png', import.meta.url),
    owl: new URL('../../public/characters/owl.png', import.meta.url),
    raccoon: new URL('../../public/characters/raccoon.png', import.meta.url),
    pigeon: new URL('../../public/characters/pigeon.png', import.meta.url),
  },
  avatar: {
    capybara: new URL('../../public/characters/capybara-avatar.png', import.meta.url),
    owl: new URL('../../public/characters/owl-avatar.png', import.meta.url),
    raccoon: new URL('../../public/characters/raccoon-avatar.png', import.meta.url),
    pigeon: new URL('../../public/characters/pigeon-avatar.png', import.meta.url),
  },
};

/** next/og cannot fetch relative URLs, so character art is inlined as a data URL. */
export async function characterDataUrl(character: Character, variant: CharacterVariant = 'portrait'): Promise<string> {
  return `data:image/png;base64,${await readFile(FILES[variant][character], 'base64')}`;
}
