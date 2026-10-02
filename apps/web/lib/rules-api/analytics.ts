import 'server-only';
import { after } from 'next/server';
import { FACTS, isFactName } from '@elsewhere/rules/core';
import { createAdminClient } from '@/lib/supabase/admin';

export interface RulesApiEvent {
  surface: 'api' | 'mcp';
  endpoint: string;
  status: number;
  client_name: string | null;
  client_version: string | null;
  tier: 'anonymous' | 'partner';
  key_id: string | null;
  rule_ids: string[];
  fact_names: string[];
  event_type: string | null;
  missing_facts: string[];
  query: string | null;
  result_count: number;
  library_version: string | null;
  latency_ms: number;
}

const EVENT_TYPES: readonly string[] = FACTS['event.type'].values;
const RULE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const int = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

// Redaction is best-effort: ASCII digits only, and dotless emails (a@b) are not covered.
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_LIKE = /\+?\d[\d\s().-]{8,}\d/g;

/** Redact first, then truncate, so a number straddling the limit never leaks partially. */
export function sanitizeQuery(q: string | null | undefined): string | null {
  if (!q) return null;
  const redacted = Array.from(
    q
      .slice(0, 2000)
      .replace(EMAIL, '[redacted]')
      .replace(PHONE_LIKE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[redacted]' : m))
      .trim(),
  )
    .slice(0, 200)
    .join('');
  return redacted || null;
}

/** Analytics must never break a response: failures are logged (message only) and swallowed. */
export async function insertEvent(event: RulesApiEvent): Promise<void> {
  try {
    const { error } = await createAdminClient().from('rules_api_events').insert(event);
    if (error) console.error('[rules-api] analytics insert failed:', error.message);
  } catch (e) {
    console.error('[rules-api] analytics insert failed:', e instanceof Error ? e.message : 'unknown error');
  }
}

/** Never blocks the response, never stores IPs. Stores fact names only, never values. */
export function scheduleEvent(event: RulesApiEvent): void {
  const row: RulesApiEvent = {
    surface: event.surface,
    endpoint: event.endpoint,
    status: int(event.status),
    client_name: event.client_name ? event.client_name.slice(0, 120) : null,
    client_version: event.client_version ? event.client_version.slice(0, 40) : null,
    tier: event.tier,
    key_id: event.key_id,
    rule_ids: event.rule_ids.filter((id) => id.length <= 120 && RULE_ID.test(id)).slice(0, 50),
    fact_names: event.fact_names.filter(isFactName),
    event_type: event.event_type && EVENT_TYPES.includes(event.event_type) ? event.event_type : null,
    missing_facts: event.missing_facts.filter(isFactName),
    query: sanitizeQuery(event.query),
    result_count: int(event.result_count),
    library_version: event.library_version,
    latency_ms: int(event.latency_ms),
  };
  after(() => insertEvent(row));
}
