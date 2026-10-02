import { DOMAINS, RULE_STATUSES, type Domain, type Rule, type RuleStatus, type RulesLibrary } from '@elsewhere/rules/core';
import { isPublic } from './projection';

const STOPWORDS = new Set([
  'a', 'about', 'am', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'get', 'how', 'i', 'if', 'in', 'is',
  'it', 'me', 'my', 'of', 'on', 'or', 'the', 'to', 'was', 'what', 'when', 'with', 'you',
]);
const MAX_QUERY_LENGTH = 2000;
const SUFFIXES = ['ations', 'ation', 'ings', 'ing', 'ed', 'es', 's'];

const MIN_STEM = 3;

/**
 * Strips one common suffix (keeping at least MIN_STEM characters), then collapses a trailing doubled
 * consonant so "cancelled" and "canceled" meet at "cancel". No regexes: linear in the word length.
 */
export function stem(word: string): string {
  let out = word;
  for (const suffix of SUFFIXES) {
    if (word.length - suffix.length >= MIN_STEM && word.endsWith(suffix)) {
      out = word.slice(0, -suffix.length);
      break;
    }
  }
  const n = out.length;
  if (n > MIN_STEM && out[n - 1] === out[n - 2] && /[b-df-hj-np-tv-z]/.test(out[n - 1])) out = out.slice(0, -1);
  return out;
}

function words(text: string): string[] {
  return text.slice(0, MAX_QUERY_LENGTH).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
}

/**
 * Query terms: stopwords dropped, stemmed, de-duplicated. A query made only of stopwords therefore
 * yields no tokens, and searchRules returns an empty result for it (it does not fall back to listing).
 */
export function tokenize(q: string): string[] {
  return [...new Set(words(q).filter((w) => !STOPWORDS.has(w)).map(stem))];
}

export interface SearchParams {
  q?: string;
  domain?: Domain;
  jurisdiction?: string;
  status?: Exclude<RuleStatus, 'draft'>;
  limit?: number;
}

export const DEFAULT_SEARCH_STATUSES: RuleStatus[] = ['verified', 'needs_review'];

/** Whole-word stem matches outrank prefix matches; title > tags > summary either way. */
function fieldScore(fieldWords: string[], token: string, whole: number, prefix: number): number {
  if (fieldWords.includes(token)) return whole;
  if (token.length >= 4 && fieldWords.some((w) => w.startsWith(token))) return prefix;
  return 0;
}

function scoreRule(rule: Rule, tokens: string[]): number {
  const title = words(rule.title).map(stem);
  const summary = words(rule.summary).map(stem);
  const tags = rule.tags.flatMap((t) => words(t)).map(stem);
  let score = 0;
  for (const token of tokens) {
    score += fieldScore(title, token, 12, 6) + fieldScore(tags, token, 6, 3) + fieldScore(summary, token, 2, 1);
  }
  return score;
}

export function searchRules(library: RulesLibrary, params: SearchParams): Rule[] {
  const statuses: RuleStatus[] = params.status ? [params.status] : DEFAULT_SEARCH_STATUSES;
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const candidates = library.rules.filter(
    (r) =>
      isPublic(r) &&
      statuses.includes(r.status) &&
      (!params.domain || r.domain === params.domain) &&
      (!params.jurisdiction || r.jurisdiction === params.jurisdiction),
  );

  if (!params.q) return candidates.sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);

  const tokens = tokenize(params.q);
  return candidates
    .map((rule) => ({ rule, score: scoreRule(rule, tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id))
    .slice(0, limit)
    .map((s) => s.rule);
}

export function parseSearchParams(url: URL): { ok: true; params: SearchParams } | { ok: false; message: string } {
  const q = url.searchParams.get('q') ?? undefined;
  const domain = url.searchParams.get('domain') ?? undefined;
  const jurisdiction = url.searchParams.get('jurisdiction') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const limitRaw = url.searchParams.get('limit');

  if (q && q.length > MAX_QUERY_LENGTH) return { ok: false, message: `q must be ${MAX_QUERY_LENGTH} characters or fewer.` };
  if (domain && !(DOMAINS as readonly string[]).includes(domain)) {
    return { ok: false, message: `domain must be one of: ${DOMAINS.join(', ')}.` };
  }
  if (jurisdiction && jurisdiction.length > 40) return { ok: false, message: 'jurisdiction is too long.' };
  if (status && (status === 'draft' || !(RULE_STATUSES as readonly string[]).includes(status))) {
    return { ok: false, message: 'status must be one of: verified, needs_review, retired.' };
  }
  const limit = limitRaw === null ? undefined : /^\d{1,3}$/.test(limitRaw) ? Number(limitRaw) : NaN;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
    return { ok: false, message: 'limit must be an integer from 1 to 50.' };
  }
  return {
    ok: true,
    params: {
      q,
      domain: domain as Domain | undefined,
      jurisdiction,
      status: status as SearchParams['status'],
      limit,
    },
  };
}
