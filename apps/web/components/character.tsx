import Image from 'next/image';
import type { Character as CharacterName } from '@elsewhere/rules/core';
import { CHARACTER_DIMENSIONS, CHARACTER_INFO, characterSrc, type CharacterVariant } from '@/lib/characters';
import { cn } from '@/lib/utils';

/**
 * Full art on public surfaces, small at moments in the app. Never use it in forms,
 * booking lists, or the money ledger.
 */
export function Character({
  character,
  width,
  variant = 'portrait',
  decorative = true,
  className,
  priority,
}: {
  character: CharacterName;
  width: number;
  variant?: CharacterVariant;
  decorative?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const dims = CHARACTER_DIMENSIONS[variant];
  const info = CHARACTER_INFO[character];
  return (
    <Image
      src={characterSrc(character, variant)}
      width={width}
      height={Math.round((width * dims.height) / dims.width)}
      alt={decorative ? '' : `${info.name}, ${info.role}`}
      aria-hidden={decorative || undefined}
      priority={priority}
      className={cn('select-none', variant === 'avatar' && 'rounded-full bg-[#efe9da]', className)}
    />
  );
}
