import { RuleSchema, SourceSchema } from '@elsewhere/rules/core';
import type { RulesLibrary } from '@elsewhere/rules/core';
import type { ZodError } from 'zod';

export class LibraryLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryLoadError';
  }
}

export const SUPPORTED_SCHEMA_VERSION = 1;

function firstIssue(error: ZodError): string {
  const issue = error.issues[0];
  return `${issue.path.join('.') || '(root)'}: ${issue.message}`;
}

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
  for (const rule of lib.rules) {
    const result = RuleSchema.safeParse(rule);
    if (!result.success) {
      const id = (rule as { id?: unknown } | null)?.id;
      throw new LibraryLoadError(`Invalid rule ${typeof id === 'string' ? id : '(no id)'}: ${firstIssue(result.error)}`);
    }
  }
  const sources = lib.sources ?? {};
  for (const [key, source] of Object.entries(sources)) {
    const result = SourceSchema.safeParse(source);
    if (!result.success) {
      throw new LibraryLoadError(`Invalid source ${key}: ${firstIssue(result.error)}`);
    }
  }
  return { ...lib, sources } as RulesLibrary;
}
