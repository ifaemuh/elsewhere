import type { Rule } from '@elsewhere/rules/core';
import type { Playbook } from './playbook-schema';

export interface CitationIssue {
  path: string;
  problem: 'missing_rule_id' | 'rule_not_allowed' | 'number_not_in_rule' | 'unparseable_quantity' | 'tier_not_hedged' | 'forbidden_phrase';
  detail: string;
}

type Unit = 'minute' | 'hour' | 'day' | 'business_day' | 'week' | 'month' | 'year' | 'night';
type Quantity =
  | { kind: 'money'; currency: string; value: number }
  | { kind: 'duration'; unit: Unit; value: number }
  | { kind: 'percent'; value: number };
type Found = Quantity & { index: number; raw: string };

const key = (q: Quantity) => (q.kind === 'money' ? `money:${q.currency}:${q.value}` : q.kind === 'duration' ? `duration:${q.unit}:${q.value}` : `percent:${q.value}`);
const label = (q: Quantity) => (q.kind === 'money' ? `${q.currency} ${q.value}` : q.kind === 'duration' ? `${q.value} ${q.unit}` : `${q.value}%`);

// ---- number parsing -------------------------------------------------------

/** "1,500" and "1.500" are thousands; "250.50" and "250,5" are decimals; with both, the last separator is the decimal. */
function parseAmount(s: string): number {
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    return Number(s.split(thousands).join('').replace(decimal, '.'));
  }
  const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : '';
  if (!sep) return Number(s);
  const parts = s.split(sep);
  const thousands = parts.length > 2 || parts[parts.length - 1].length === 3;
  return Number(thousands ? parts.join('') : s.replace(sep, '.'));
}

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const NUMWORD = `(?:${[...Object.keys(WORDS), 'hundred', 'thousand', 'million'].join('|')})`;

function wordsToNumber(phrase: string): number {
  let total = 0;
  let current = 0;
  for (const w of phrase.toLowerCase().split(/[\s-]+/)) {
    if (w in WORDS) current += WORDS[w];
    else if (w === 'hundred') current = (current || 1) * 100;
    else if (w === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
    } else if (w === 'million') {
      total += (current || 1) * 1_000_000;
      current = 0;
    }
  }
  return total + current;
}

// ---- normalization ---------------------------------------------------------------

/** One pass before extraction and phrase matching, so look-alike characters cannot hide a quantity or a promise. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '') // zero-width, bidi marks, soft hyphen, invisible operators (U+2061-2064)
    .replace(/[‐-―−]/g, '-')
    .replace(/[   - ]/g, ' ')
    .replace(/[’‘ʼ′`]/g, "'")
    .replace(/\s+/g, ' ');
}

// ---- extraction -------------------------------------------------------------

const UNIT_FULL = '(?:(?:business|working|calendar)[\\s-]+days?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?|nights?)';
const UNIT = `(?:${UNIT_FULL}|h|d)`;
const CURRENCY_WORD = '(?:euros?|dollars?|pounds?|bucks?)';
const CODES = 'EUR|USD|GBP|CAD|CHF|AUD|NZD';
const NUM = '\\d+(?:[.,]\\d+)*';
const SEP = '(?:\\s*-\\s*|\\s*/\\s*|,\\s+|\\s+(?:or|and|to)\\s+)';
const STOP = `(?!\\d|[.,]\\d)(?!\\s*(?:%|percent\\b|per cent\\b|${UNIT}\\b|(?:${CODES}|${CURRENCY_WORD})\\b|[€£$]))`;
const LIST = `${NUM}(?:${SEP}${NUM}${STOP})*`;

function canonicalUnit(raw: string): Unit {
  const u = raw.toLowerCase();
  if (/^(business|working)/.test(u)) return 'business_day';
  if (/^calendar/.test(u)) return 'day';
  if (u.startsWith('min')) return 'minute';
  if (u.startsWith('h')) return 'hour';
  if (u.startsWith('d')) return 'day';
  if (u.startsWith('w')) return 'week';
  if (u.startsWith('mo')) return 'month';
  if (u.startsWith('y')) return 'year';
  return 'night';
}

function canonicalCurrency(raw: string): string {
  const c = raw.toLowerCase();
  if (c === '€' || c.startsWith('eur')) return 'EUR';
  if (c === '£' || c.startsWith('gbp') || c.startsWith('pound')) return 'GBP';
  if (c.startsWith('nz')) return 'NZD';
  if (c === 'a$' || c === 'au$' || c === 'aud') return 'AUD';
  if (c === 'c$' || c === 'ca$' || c === 'cad') return 'CAD';
  if (c === 'chf') return 'CHF';
  return 'USD';
}

const SPELLED = new RegExp(`\\b(${NUMWORD}(?:[\\s-]+(?:and\\s+)?${NUMWORD})*)[\\s-]+(${UNIT_FULL}|percent|per cent|${CURRENCY_WORD})\\b`, 'gi');
const DIGITLESS = /\b(?:half an hour|(?:a|an) (?:week|year|fortnight|hour))\b/gi;
const MULTIPLIER = /\b(?:double|twice|triple|quadruple)\b|\b\d+\s*x\b|\b(?:\d+|two|three|four|five) times\b/gi;
const MONEY_PRE = new RegExp(`(?<![A-Za-z])(C\\$|CA\\$|US\\$|A\\$|AU\\$|NZ\\$|${CODES}|[$€£])\\s?(${LIST})(\\s?k\\b)?`, 'gi');
const MONEY_POST = new RegExp(`(?<![A-Za-z\\d.,])(${LIST})\\s?(${CODES}|${CURRENCY_WORD}|€|£|\\$)(?![A-Za-z])`, 'gi');
const PERCENT = /(?<![A-Za-z\d.,])(\d+(?:[.,]\d+)?)\s?(?:%|percent\b|per cent\b)/gi;
const RANGE = new RegExp(`(?<![A-Za-z\\d.,])(?:between\\s+)?(\\d+(?:\\.\\d+)?)(?:\\s*[-/]\\s*|\\s+(?:to|or|and)\\s+)(\\d+(?:\\.\\d+)?)\\s*(${UNIT})\\b`, 'gi');
const COMPOUND = /(?<![A-Za-z\d.,])(\d+)\s*(?:hours?|hrs?|h)\s*(?:and\s+)?(\d+)\s*(?:minutes?|mins?|m)\b/gi;
const DECIMAL_COMMA = new RegExp(`(?<![A-Za-z\\d.,])\\d+,\\d{1,2}(?!\\d)\\s*-?\\s*${UNIT}\\b`, 'gi');
const SINGLE = new RegExp(`(?<![A-Za-z\\d.,])(\\d+(?:,\\d{3})*(?:\\.\\d+)?)(?:\\+|[\\s-]?plus)?\\s*-?\\s*(${UNIT})\\b`, 'gi');

/** A quantity we refuse to compare. `key` is set when it is a duration or phrase that a rule's own text can vouch for. */
interface Flagged {
  raw: string;
  key?: string;
}

/** Pulls the quantities out of `text`. Spelled-out numbers, digit-less durations and multipliers cannot be compared directly, so they are returned as `flagged`. */
export function extractQuantities(input: string): { found: Found[]; flagged: Flagged[] } {
  let rest = normalizeText(input);
  const found: Found[] = [];
  const flagged: Flagged[] = [];

  const consume = (re: RegExp, handle: (m: RegExpMatchArray) => void) => {
    const matches = [...rest.matchAll(re)];
    for (const m of matches) handle(m);
    for (const m of matches) rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index! + m[0].length);
  };
  const money = (m: RegExpMatchArray, currency: string, list: string, thousand: boolean) => {
    for (const n of list.matchAll(/\d+(?:[.,]\d+)*/g)) {
      found.push({ kind: 'money', currency, value: parseAmount(n[0]) * (thousand ? 1000 : 1), index: m.index!, raw: m[0] });
    }
  };

  consume(SPELLED, (m) => {
    const unit = m[2].toLowerCase();
    const isDuration = !/^(percent|per cent|euro|dollar|pound|buck)/.test(unit);
    flagged.push({ raw: m[0], key: isDuration ? key({ kind: 'duration', unit: canonicalUnit(unit), value: wordsToNumber(m[1]) }) : undefined });
  });
  consume(DIGITLESS, (m) => flagged.push({ raw: m[0], key: `phrase:${m[0].toLowerCase()}` }));
  consume(MULTIPLIER, (m) => flagged.push({ raw: m[0] }));
  consume(MONEY_PRE, (m) => money(m, canonicalCurrency(m[1]), m[2], Boolean(m[3])));
  consume(MONEY_POST, (m) => money(m, canonicalCurrency(m[2]), m[1], false));
  consume(PERCENT, (m) => found.push({ kind: 'percent', value: parseAmount(m[1]), index: m.index!, raw: m[0] }));
  consume(RANGE, (m) => {
    const unit = canonicalUnit(m[3]);
    found.push({ kind: 'duration', unit, value: Number(m[1]), index: m.index!, raw: m[0] }, { kind: 'duration', unit, value: Number(m[2]), index: m.index!, raw: m[0] });
  });
  consume(COMPOUND, (m) => found.push({ kind: 'duration', unit: 'minute', value: Number(m[1]) * 60 + Number(m[2]), index: m.index!, raw: m[0] }));
  consume(DECIMAL_COMMA, (m) => flagged.push({ raw: m[0] }));
  consume(SINGLE, (m) => found.push({ kind: 'duration', unit: canonicalUnit(m[2]), value: Number(m[1].replace(/,/g, '')), index: m.index!, raw: m[0] }));
  return { found, flagged };
}

// ---- what a rule allows -----------------------------------------------------

const AMOUNT_KEY_CURRENCY = /(?:^|_)(eur|usd|gbp|cad|chf|aud|nzd)(?:_|$)/i;
const CAPPED_KEY = /^max_|maximum|up_to|(?:^|_)cap(?:_|$)/i;

function ruleText(rule: Rule): string[] {
  return [rule.title, rule.summary, rule.entitlement.timing ?? '', ...rule.how_to_claim.steps, ...rule.exceptions];
}

interface Allowed {
  keys: Set<string>;
  moneyValues: Map<string, Set<number>>;
  /** Money that the rule states only as a maximum: it must be hedged with "up to". */
  capped: Set<string>;
}

function allowedFor(rules: Rule[], extraMinutes: string[]): Allowed {
  const keys = new Set<string>();
  const capped = new Set<string>();
  const moneyValues = new Map<string, Set<number>>();
  const add = (q: Quantity) => {
    keys.add(key(q));
    if (q.kind === 'money') moneyValues.set(q.currency, (moneyValues.get(q.currency) ?? new Set()).add(q.value));
  };
  for (const rule of rules) {
    for (const [k, v] of Object.entries(rule.entitlement.amount ?? {})) {
      for (const item of Array.isArray(v) ? v : [v]) {
        const currency = AMOUNT_KEY_CURRENCY.exec(k)?.[1];
        if (typeof item === 'number' && currency) {
          const q: Quantity = { kind: 'money', currency: currency.toUpperCase(), value: item };
          add(q);
          if (CAPPED_KEY.test(k)) capped.add(key(q));
        } else if (typeof item === 'string') for (const q of extractQuantities(item).found) if (q.kind === 'money') add(q);
      }
    }
    for (const text of ruleText(rule)) {
      const { found, flagged } = extractQuantities(text);
      for (const q of found) add(q);
      for (const f of flagged) if (f.key) keys.add(f.key);
    }
  }
  for (const raw of extraMinutes) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    add({ kind: 'duration', unit: 'minute', value: n });
    if (n >= 60) add({ kind: 'duration', unit: 'hour', value: Math.floor(n / 60) });
  }
  return { keys, moneyValues, capped };
}

// ---- forbidden phrases --------------------------------------------------------

const FILING_VERBS = '(?:filed|filing|claimed|sued|submitted|lodged|booked|requested)';
/** Messages are drafts in the traveler's voice, so "we" there is the traveler; only Elsewhere itself is barred as the subject. */
const FILED_BY_US = new RegExp(`\\b(we|elsewhere|our (?:agents?|team|staff))\\b[^.;]{0,40}\\b${FILING_VERBS}\\b`, 'i');
const FILED_BY_ELSEWHERE = new RegExp(`\\b(elsewhere|our (?:agents?|team|staff))\\b[^.;]{0,40}\\b${FILING_VERBS}\\b`, 'i');
const GETS = '(?:get|receive|be (?:fully )?(?:paid|refunded|compensated))';
const ALWAYS: RegExp[] = [
  /on your behalf/i,
  /\bguarantee(d|s)?\b/i,
  new RegExp(`\\byou(?:'ll| will)(?: (?:each|all|both))? ${GETS}\\b`, 'i'),
  new RegExp(`\\b(?:everyone|everybody|each of you|all of you)(?: will|'ll) ${GETS}\\b`, 'i'),
];
const NOT_IN_MESSAGES: RegExp[] = [/\b(?:you(?:'re| are)(?: (?:all|each|both))?|(?:each of you|everyone|everybody) is|all of you are) owed\b/i, /\b(?:has|have) been (?:filed|submitted|lodged|claimed)\b/i];

// ---- the check ------------------------------------------------------------------

/** "up to" within 3 words before an amount, in the same sentence, with no other number in between. */
const HEDGE = /\bup to(?!\s+(?:date|you)\b)((?:\s+[^\s.!?:;]+){0,3})\s*$/i;
const hedged = (before: string) => {
  const m = HEDGE.exec(before);
  return m !== null && !/\d/.test(m[1]);
};

/**
 * Deterministic backstop for model-written playbooks. Every field is checked: money, durations and percents must
 * appear (same currency, same unit) in a cited rule's verified text, and forbidden promises are rejected.
 * `extraNumbers` are incident durations in MINUTES (e.g. the delay): N allows N minutes, the compound "h min" form of N,
 * and floor(N/60) hours. They never allow money or percents.
 */
export function checkCitations(playbook: Playbook, allowed: Rule[], extraNumbers: string[] = []): CitationIssue[] {
  const allowedById = new Map(allowed.map((rule) => [rule.id, rule]));
  const issues: CitationIssue[] = [];

  const quantityCheck = (path: string, text: string, scope: Rule[]) => {
    const permitted = allowedFor(scope, extraNumbers);
    text = normalizeText(text);
    const { found, flagged } = extractQuantities(text);
    const unparseable = flagged.filter((f) => !(f.key && permitted.keys.has(f.key)));
    for (const u of unparseable) issues.push({ path, problem: 'unparseable_quantity', detail: u.raw });
    for (const q of found) {
      if (!permitted.keys.has(key(q))) {
        issues.push({ path, problem: 'number_not_in_rule', detail: label(q) });
      } else if (q.kind === 'money' && ((permitted.moneyValues.get(q.currency)?.size ?? 0) > 1 || permitted.capped.has(key(q))) && !hedged(text.slice(0, q.index))) {
        issues.push({ path, problem: 'tier_not_hedged', detail: q.raw });
      }
    }
    return found.length + flagged.length > 0;
  };

  const phrases = (path: string, text: string, isMessage: boolean) => {
    text = normalizeText(text);
    for (const re of [isMessage ? FILED_BY_ELSEWHERE : FILED_BY_US, ...ALWAYS, ...(isMessage ? [] : NOT_IN_MESSAGES)]) {
      const m = re.exec(text);
      if (m) issues.push({ path, problem: 'forbidden_phrase', detail: m[0] });
    }
  };

  const cited = (path: string, ruleIds: string[]) => {
    for (const id of ruleIds) if (!allowedById.has(id)) issues.push({ path, problem: 'rule_not_allowed', detail: id });
    return ruleIds.flatMap((id) => (allowedById.has(id) ? [allowedById.get(id)!] : []));
  };

  /** The summary and caveats cite nothing, so they are held to the union of every applying rule. */
  const loose = (path: string, text: string) => {
    quantityCheck(path, text, allowed);
    phrases(path, text, false);
  };

  /** `required`: the item must cite a rule even with no quantity (owed). Otherwise only when it states a quantity. */
  const item = (path: string, text: string, ruleIds: string[], required: boolean, isMessage: boolean) => {
    const scope = ruleIds.length > 0 ? cited(path, ruleIds) : allowed;
    const hasQuantity = quantityCheck(path, text, scope);
    if (ruleIds.length === 0 && (required || hasQuantity)) issues.push({ path, problem: 'missing_rule_id', detail: text.slice(0, 80) });
    phrases(path, text, isMessage);
  };

  loose('summary', playbook.summary);
  playbook.owed.forEach((o, i) => item(`owed[${i}]`, o.text, o.rule_ids, true, false));
  playbook.steps.forEach((s, i) => item(`steps[${i}]`, s.text, s.rule_ids, false, false));
  playbook.messages.forEach((m, i) => item(`messages[${i}]`, m.body, m.rule_ids, false, true));
  playbook.caveats.forEach((c, i) => loose(`caveats[${i}]`, c));
  return issues;
}
