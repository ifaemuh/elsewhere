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

// ---- extraction -------------------------------------------------------------

const UNIT = '(?:(?:business|working|calendar)[\\s-]+days?|minutes?|mins?|hours?|hrs?|h|days?|weeks?|months?|years?|yrs?|nights?)';
const CURRENCY_WORD = '(?:euros?|dollars?|pounds?)';

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
  if (c === 'c$' || c === 'ca$' || c === 'cad') return 'CAD';
  if (c === 'chf') return 'CHF';
  return 'USD';
}

const SPELLED = new RegExp(`\\b${NUMWORD}(?:[\\s-]+(?:and\\s+)?${NUMWORD})*[\\s-]+(?:(?:business|working|calendar)[\\s-]+)?(?:${UNIT.slice(UNIT.indexOf('minutes'), -1)}|percent|${CURRENCY_WORD})\\b`, 'gi');
const MULTIPLIER = /\b(?:double|twice|triple)\b/gi;
const MONEY_PRE = /(?<![A-Za-z])(C\$|CA\$|US\$|EUR|USD|GBP|CAD|CHF|[$€£])\s?(\d+(?:[.,]\d+)*)(\s?k\b)?/gi;
const MONEY_POST = new RegExp(`(?<![A-Za-z\\d.,])(\\d+(?:[.,]\\d+)*)\\s?(EUR|USD|GBP|CAD|CHF|${CURRENCY_WORD}|€|£|\\$)(?![A-Za-z])`, 'gi');
const PERCENT = /(?<![A-Za-z\d.,])(\d+(?:[.,]\d+)?)\s?(?:%|percent\b)/gi;
const RANGE = new RegExp(`(?<![A-Za-z\\d.,])(\\d+(?:\\.\\d+)?)\\s*[–—-]\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT})\\b`, 'gi');
const COMPOUND = /(?<![A-Za-z\d.,])(\d+)\s*(?:hours?|hrs?|h)\s*(?:and\s+)?(\d+)\s*(?:minutes?|mins?)\b/gi;
const SINGLE = new RegExp(`(?<![A-Za-z\\d.,])(\\d+(?:\\.\\d+)?)\\s*-?\\s*(${UNIT})\\b`, 'gi');

/** Pulls the quantities out of `text`. Spelled-out numbers and multipliers cannot be compared, so they are returned as `unparseable`. */
export function extractQuantities(text: string): { found: Found[]; unparseable: string[]; spelled: { value: number; unit: Unit }[] } {
  let rest = text;
  const found: Found[] = [];
  const unparseable: string[] = [];
  const spelled: { value: number; unit: Unit }[] = [];

  const consume = (re: RegExp, handle: (m: RegExpMatchArray) => void) => {
    const matches = [...rest.matchAll(re)];
    for (const m of matches) handle(m);
    for (const m of matches) rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index! + m[0].length);
  };

  consume(SPELLED, (m) => {
    unparseable.push(m[0]);
    const [, num, unit] = m[0].toLowerCase().match(new RegExp(`^(.*?)[\\s-]+((?:(?:business|working|calendar)[\\s-]+)?${UNIT.slice(UNIT.indexOf('minutes'), -1)}|percent|${CURRENCY_WORD})$`)) ?? [];
    if (num && unit && !/^(percent|euro|dollar|pound)/.test(unit)) spelled.push({ value: wordsToNumber(num), unit: canonicalUnit(unit) });
  });
  consume(MULTIPLIER, (m) => unparseable.push(m[0]));
  consume(MONEY_PRE, (m) => {
    const value = parseAmount(m[2]) * (m[3] ? 1000 : 1);
    found.push({ kind: 'money', currency: canonicalCurrency(m[1]), value, index: m.index!, raw: m[0] });
  });
  consume(MONEY_POST, (m) => found.push({ kind: 'money', currency: canonicalCurrency(m[2]), value: parseAmount(m[1]), index: m.index!, raw: m[0] }));
  consume(PERCENT, (m) => found.push({ kind: 'percent', value: parseAmount(m[1]), index: m.index!, raw: m[0] }));
  consume(RANGE, (m) => {
    const unit = canonicalUnit(m[3]);
    found.push({ kind: 'duration', unit, value: Number(m[1]), index: m.index!, raw: m[0] }, { kind: 'duration', unit, value: Number(m[2]), index: m.index!, raw: m[0] });
  });
  consume(COMPOUND, (m) => found.push({ kind: 'duration', unit: 'minute', value: Number(m[1]) * 60 + Number(m[2]), index: m.index!, raw: m[0] }));
  consume(SINGLE, (m) => found.push({ kind: 'duration', unit: canonicalUnit(m[2]), value: Number(m[1]), index: m.index!, raw: m[0] }));
  return { found, unparseable, spelled };
}

// ---- what a rule allows -----------------------------------------------------

const AMOUNT_KEY_CURRENCY = /(?:^|_)(eur|usd|gbp|cad|chf)(?:_|$)/i;

function ruleText(rule: Rule): string[] {
  return [rule.title, rule.summary, rule.entitlement.timing ?? '', ...rule.how_to_claim.steps, ...rule.exceptions];
}

interface Allowed {
  keys: Set<string>;
  moneyValues: Map<string, Set<number>>;
}

function allowedFor(rules: Rule[], extraMinutes: string[]): Allowed {
  const keys = new Set<string>();
  const moneyValues = new Map<string, Set<number>>();
  const add = (q: Quantity) => {
    keys.add(key(q));
    if (q.kind === 'money') moneyValues.set(q.currency, (moneyValues.get(q.currency) ?? new Set()).add(q.value));
  };
  for (const rule of rules) {
    for (const [k, v] of Object.entries(rule.entitlement.amount ?? {})) {
      for (const item of Array.isArray(v) ? v : [v]) {
        const currency = AMOUNT_KEY_CURRENCY.exec(k)?.[1];
        if (typeof item === 'number' && currency) add({ kind: 'money', currency: currency.toUpperCase(), value: item });
        else if (typeof item === 'string') for (const q of extractQuantities(item).found) if (q.kind === 'money') add(q);
      }
    }
    for (const text of ruleText(rule)) {
      const { found, spelled } = extractQuantities(text);
      for (const q of found) add(q);
      for (const s of spelled) add({ kind: 'duration', unit: s.unit, value: s.value });
    }
  }
  for (const raw of extraMinutes) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    add({ kind: 'duration', unit: 'minute', value: n });
    if (n >= 60) add({ kind: 'duration', unit: 'hour', value: Math.floor(n / 60) });
  }
  return { keys, moneyValues };
}

// ---- forbidden phrases --------------------------------------------------------

const FORBIDDEN: RegExp[] = [
  /\b(we|elsewhere|our team)\b[^.]{0,40}\b(filed|filing|claimed|sued|submitted|booked|requested)\b/i,
  /on your behalf/i,
  /\bguarantee(d|s)?\b/i,
  /\byou will (get|receive|be (paid|refunded|compensated))\b/i,
];
const OWED = /\byou('re| are) owed\b/i;

// ---- the check ------------------------------------------------------------------

const HEDGE = /\bup to\b(?:\s+\S+){0,3}\s*$/i;

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
    const { found, unparseable } = extractQuantities(text);
    for (const u of unparseable) issues.push({ path, problem: 'unparseable_quantity', detail: u });
    for (const q of found) {
      if (!permitted.keys.has(key(q))) {
        issues.push({ path, problem: 'number_not_in_rule', detail: label(q) });
      } else if (q.kind === 'money' && (permitted.moneyValues.get(q.currency)?.size ?? 0) > 1 && !HEDGE.test(text.slice(0, q.index))) {
        issues.push({ path, problem: 'tier_not_hedged', detail: q.raw });
      }
    }
    return found.length + unparseable.length > 0;
  };

  const phrases = (path: string, text: string, isMessage: boolean) => {
    for (const re of isMessage ? FORBIDDEN : [...FORBIDDEN, OWED]) {
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
