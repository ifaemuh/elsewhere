import type { RulesLibrary } from '@elsewhere/rules/core';
import { LibraryLoadError } from '@/lib/rules/parse-library';

// Same class as the real loader throws, so `instanceof` checks in route code behave in tests.
export { LibraryLoadError };

let current: RulesLibrary | null = null;

export function setLibrary(library: RulesLibrary | null): void {
  current = library;
}

export function getLibrary(): RulesLibrary {
  if (!current) throw new LibraryLoadError('No rules library set for this test');
  return current;
}
