import type { RulesLibrary } from '@elsewhere/rules/core';
import raw from '../../../../packages/rules/dist/rules.json';
import { parseLibrary } from './parse-library';

export { LibraryLoadError } from './parse-library';

let cached: RulesLibrary | null = null;

/** The rules library baked into this deployment. Changes only by deploying. */
export function getLibrary(): RulesLibrary {
  cached ??= parseLibrary(raw);
  return cached;
}
