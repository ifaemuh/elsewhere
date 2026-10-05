import type { Rule, Source } from './schema';

/** NFKC (folds compatibility forms such as ligatures and full-width letters), curly quotes →
 *  straight, all whitespace runs (including NBSP) → one space, trimmed. Case-sensitive; dashes
 *  and other punctuation are NOT folded, so an en dash never matches a hyphen. */
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

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** True when `quote` occurs in `text` and, wherever it starts or ends on a letter or digit, the
 *  neighbouring character is not one (so "2 hours or less" never matches inside "12 hours or less"). */
export function containsQuote(text: string, quote: string): boolean {
  if (!quote) return true;
  const startsWord = WORD_CHAR.test(quote[0]!);
  const endsWord = WORD_CHAR.test(quote[quote.length - 1]!);
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
    const before = text[at - 1];
    const after = text[at + quote.length];
    if (startsWord && before !== undefined && WORD_CHAR.test(before)) continue;
    if (endsWord && after !== undefined && WORD_CHAR.test(after)) continue;
    return true;
  }
  return false;
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
        } else if (!containsQuote(text, normalizeText(quote.text))) {
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

/** A rule's quotes as `source` + normalized text keys; used to tell which quotes a PR touched. */
export function quoteFingerprints(rule: Pick<Rule, 'sources'>): Set<string> {
  return new Set(rule.sources.flatMap((ref) => ref.quotes.map((q) => `${ref.source}\u0000${normalizeText(q.text)}`)));
}

/**
 * CI view of quote issues, given each rule's quotes at the base branch (`base`, by rule id; a rule
 * absent from `base` is new). A quote that is new or changed in the PR must be found, whatever
 * the rule's status, and a new quote whose source text is missing cannot be proven, so it fails
 * too. An unchanged quote fails only when its rule is verified and the text is present but
 * different; otherwise it is a warning (outages and already-flagged rules must not block merges,
 * least of all the backstop PR that flags them).
 */
export function partitionCiIssues(
  issues: QuoteIssue[],
  rules: Pick<Rule, 'id' | 'status' | 'sources'>[],
  base: Map<string, Set<string>>,
): { failures: QuoteIssue[]; warnings: QuoteIssue[] } {
  const status = new Map(rules.map((r) => [r.id, r.status]));
  const failures: QuoteIssue[] = [];
  const warnings: QuoteIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.source_key}\u0000${normalizeText(issue.quote)}`;
    const isNew = !base.get(issue.rule_id)?.has(key);
    const blocks = isNew || (issue.reason === 'not_found' && status.get(issue.rule_id) === 'verified');
    (blocks ? failures : warnings).push(issue);
  }
  return { failures, warnings };
}
