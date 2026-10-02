import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { RulesValidationError } from './load';
import type { Source } from './schema';

const Selectors = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

const OtaOverrideSchema = z.strictObject({
  select: Selectors.optional(),
  remove: Selectors.optional(),
  execute_client_scripts: z.boolean().optional(),
});
export type OtaOverride = z.infer<typeof OtaOverrideSchema>;

export interface OtaTerms {
  fetch: string;
  select?: string | string[];
  remove?: string | string[];
  executeClientScripts?: boolean;
}

export interface OtaDeclaration {
  name: string;
  terms: Record<string, OtaTerms>;
}

export function loadOtaOverrides(file: string): Record<string, OtaOverride> {
  const raw: unknown = parse(readFileSync(file, 'utf8')) ?? {};
  const result = z.record(z.string(), OtaOverrideSchema).safeParse(raw);
  if (!result.success) {
    throw new RulesValidationError(result.error.issues.map((i) => ({ file, path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

const isPdf = (url: string) => new URL(url).pathname.toLowerCase().endsWith('.pdf');

/** One Open Terms Archive declaration per service, from the `ota` sources. */
export function buildDeclarations(
  sources: Record<string, Source>,
  overrides: Record<string, OtaOverride>,
): Record<string, OtaDeclaration> {
  const issues: { file: string; path: string; message: string }[] = [];
  const declarations: Record<string, OtaDeclaration> = {};

  for (const key of Object.keys(overrides)) {
    const source = sources[key];
    if (!source || !('ota' in source.detector)) {
      issues.push({ file: 'ota-overrides.yaml', path: key, message: 'override for a source that is not an ota source' });
    }
  }

  for (const source of Object.values(sources).sort((a, b) => a.key.localeCompare(b.key))) {
    if (!('ota' in source.detector)) continue;
    const { service, terms_type } = source.detector.ota;
    const override = overrides[source.key] ?? {};
    const declaration = (declarations[service] ??= { name: service, terms: {} });
    if (declaration.terms[terms_type]) {
      issues.push({ file: 'sources.yaml', path: source.key, message: `"${service}" already has a "${terms_type}" document` });
      continue;
    }
    if (isPdf(source.url)) {
      if (override.select || override.remove) {
        issues.push({ file: 'ota-overrides.yaml', path: source.key, message: 'PDF sources take no selectors' });
      }
      declaration.terms[terms_type] = { fetch: source.url };
      continue;
    }
    declaration.terms[terms_type] = {
      fetch: source.url,
      select: override.select ?? 'body',
      ...(override.remove ? { remove: override.remove } : {}),
      ...(override.execute_client_scripts !== undefined ? { executeClientScripts: override.execute_client_scripts } : {}),
    };
  }

  if (issues.length) throw new RulesValidationError(issues);
  return declarations;
}
