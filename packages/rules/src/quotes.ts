import type { Rule, Source } from './schema';

/** NFKC, curly quotes → straight, all whitespace runs → one space, trimmed. Case-sensitive. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** POSIX join without node:path, so this module stays bundle-safe. */
function join(dir: string, ...parts: string[]): string {
  return [dir.replace(/\/+$/, ''), ...parts].join('/');
}

/** Where a source's current text lives inside a checkout of elsewhere-sources-versions. */
export function sourceTextPath(source: Source, versionsDir: string): string {
  if (!versionsDir) throw new Error('sourceTextPath: versionsDir must not be empty');
  const { detector } = source;
  if ('ota' in detector) return join(versionsDir, detector.ota.service, `${detector.ota.terms_type}.md`);
  if ('ecfr' in detector) return join(versionsDir, 'eCFR', `title-${detector.ecfr.title}-part-${detector.ecfr.part}.md`);
  return join(versionsDir, 'changedetection', `${source.key}.md`);
}

export interface QuoteIssue {
  rule_id: string;
  source_key: string;
  quote: string;
  reason: 'not_found' | 'source_missing';
}

export function checkQuotes(rules: Rule[], sourceTexts: Record<string, string>): QuoteIssue[] {
  const normalized = new Map<string, string>();
  const textOf = (key: string): string | undefined => {
    if (!(key in sourceTexts)) return undefined;
    if (!normalized.has(key)) normalized.set(key, normalizeText(sourceTexts[key] ?? ''));
    return normalized.get(key);
  };

  const issues: QuoteIssue[] = [];
  for (const rule of rules) {
    for (const ref of rule.sources) {
      const text = textOf(ref.source);
      for (const quote of ref.quotes) {
        if (text === undefined) {
          issues.push({ rule_id: rule.id, source_key: ref.source, quote: quote.text, reason: 'source_missing' });
        } else if (!text.includes(normalizeText(quote.text))) {
          issues.push({ rule_id: rule.id, source_key: ref.source, quote: quote.text, reason: 'not_found' });
        }
      }
    }
  }
  return issues;
}

function pathExists(target: unknown, path: string): boolean {
  let current: unknown = target;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return false;
    current = (current as Record<string, unknown>)[segment];
    if (current === undefined) return false;
  }
  return true;
}

/** Every path in any quote's `supports` must exist on the rule; `summary` and
 *  `entitlement` must each be supported at least once. Returns messages. */
export function checkSupports(rule: Rule): string[] {
  const messages: string[] = [];
  const paths = [...new Set(rule.sources.flatMap((ref) => ref.quotes.flatMap((quote) => quote.supports)))];
  const existing = paths.filter((path) => pathExists(rule, path));
  for (const path of paths) {
    if (!existing.includes(path)) messages.push(`${rule.id}: supports path "${path}" does not exist on the rule`);
  }
  for (const required of ['summary', 'entitlement']) {
    if (!existing.some((p) => p === required || p.startsWith(`${required}.`))) {
      messages.push(`${rule.id}: no quote supports "${required}"`);
    }
  }
  return messages;
}
