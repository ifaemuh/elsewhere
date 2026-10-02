import type { RulesLibrary } from '@elsewhere/rules';

export class LibraryLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryLoadError';
  }
}

export const SUPPORTED_SCHEMA_VERSION = 1;

export function parseLibrary(raw: unknown): RulesLibrary {
  if (typeof raw !== 'object' || raw === null) {
    throw new LibraryLoadError('rules.json is not an object');
  }
  const lib = raw as Partial<RulesLibrary>;
  if (lib.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new LibraryLoadError(`Unsupported schema_version ${String(lib.schema_version)}`);
  }
  if (typeof lib.library_version !== 'string' || !Array.isArray(lib.rules) || !Array.isArray(lib.changes)) {
    throw new LibraryLoadError('rules.json is missing library_version, rules, or changes');
  }
  return { ...lib, sources: lib.sources ?? {} } as RulesLibrary;
}
