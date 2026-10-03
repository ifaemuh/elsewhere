import type { Rule } from '@elsewhere/rules/core';
import type { Playbook } from './playbook-schema';

export interface CitationIssue {
  path: string;
  problem: 'missing_rule_id' | 'rule_not_allowed' | 'number_not_in_rule';
  detail: string;
}

const MONEY = /[$€£]\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:USD|EUR|GBP|dollars?|euros?|pounds?)\b/gi;
const DURATION = /(\d+(?:\.\d+)?)\s*(?:business\s+)?(?:days?|hours?|hrs?|minutes?|mins?|weeks?|months?)\b/gi;

function normalize(n: string): string {
  return String(Number(n.replace(/,/g, '')));
}

/** Money amounts and durations only. Flight numbers, dates, and codes are never treated as claims. */
export function claimNumbers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(MONEY)) found.push(normalize(match[1] ?? match[2]));
  for (const match of text.matchAll(DURATION)) found.push(normalize(match[1]));
  return found;
}

function ruleNumbers(rule: Rule): string[] {
  const text = [rule.title, rule.summary, rule.entitlement.timing ?? '', ...rule.how_to_claim.steps, ...rule.exceptions].join(' ');
  const fromText = [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => normalize(m[0]));
  const fromAmounts = Object.values(rule.entitlement.amount ?? {})
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .flatMap((v) => (typeof v === 'number' ? [String(v)] : typeof v === 'string' ? [...v.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => normalize(m[0])) : []));
  return [...fromText, ...fromAmounts];
}

export function checkCitations(playbook: Playbook, allowed: Rule[], extraNumbers: string[] = []): CitationIssue[] {
  const allowedById = new Map(allowed.map((rule) => [rule.id, rule]));
  const issues: CitationIssue[] = [];

  const check = (path: string, ruleIds: string[], text: string, claim: boolean) => {
    if (claim && ruleIds.length === 0) issues.push({ path, problem: 'missing_rule_id', detail: text.slice(0, 80) });
    for (const id of ruleIds) if (!allowedById.has(id)) issues.push({ path, problem: 'rule_not_allowed', detail: id });
    if (!claim) return;
    const permitted = new Set([...extraNumbers.map(normalize), ...ruleIds.flatMap((id) => (allowedById.has(id) ? ruleNumbers(allowedById.get(id)!) : []))]);
    for (const n of claimNumbers(text)) if (!permitted.has(n)) issues.push({ path, problem: 'number_not_in_rule', detail: n });
  };

  playbook.owed.forEach((item, i) => check(`owed[${i}]`, item.rule_ids, item.text, true));
  playbook.messages.forEach((message, i) => check(`messages[${i}]`, message.rule_ids, message.body, true));
  playbook.steps.forEach((step, i) => check(`steps[${i}]`, step.rule_ids, step.text, false));
  return issues;
}
