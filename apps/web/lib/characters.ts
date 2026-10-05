import type { Character } from '@elsewhere/rules/core';

export const CHARACTER_INFO: Record<Character, { name: string; role: string }> = {
  capybara: { name: 'Capybara', role: 'the unbothered one' },
  owl: { name: 'Owl', role: 'the planner' },
  raccoon: { name: 'Raccoon', role: 'the chaos one' },
  pigeon: { name: 'Pigeon', role: 'the deal hunter' },
};

/** Runtime list of the cast. The test pins it to the contract's CHARACTERS. */
export const CHARACTER_NAMES = Object.keys(CHARACTER_INFO) as Character[];

export type CharacterVariant = 'portrait' | 'avatar';

export const CHARACTER_DIMENSIONS: Record<CharacterVariant, { width: number; height: number }> = {
  portrait: { width: 640, height: 960 },
  avatar: { width: 256, height: 256 },
};

export function characterSrc(character: Character, variant: CharacterVariant = 'portrait'): string {
  return variant === 'avatar' ? `/characters/${character}-avatar.png` : `/characters/${character}.png`;
}
