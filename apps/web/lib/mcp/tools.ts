import { z } from 'zod';
import type { CallToolResult, McpServer, ServerContext } from '@modelcontextprotocol/server';
import { DOMAINS, type RulesLibrary } from '@elsewhere/rules/core';
import { getLibrary, LibraryLoadError } from '@/lib/rules/library';
import { scheduleEvent, type RulesApiEvent } from '@/lib/rules-api/analytics';
import { isIsoDate, publicChangesSince } from '@/lib/rules-api/changes';
import { factsVocabulary } from '@/lib/rules-api/facts-vocabulary';
import { matchSituation } from '@/lib/rules-api/match-situation';
import { isPublic, toPublicRule, toRuleSummary } from '@/lib/rules-api/projection';
import { searchRules } from '@/lib/rules-api/search';
import { VOCABULARY_HINT, knownFactNames, parseSituation } from '@/lib/rules-api/situation';
import { ATTRIBUTION, type LinkAttribution } from '@/lib/rules-api/types';
import { callerFromContext, clientFromContext } from './client-info';
import { changesText, factsText, matchText, ruleText, searchText } from './text';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const RULE_ID = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);

const AttributionOut = z.object({ text: z.string(), required: z.boolean() });
const CitationOut = z.looseObject({ url: z.string(), kind: z.string(), quote: z.string() });
const PublicRuleOut = z.looseObject({
  id: z.string(),
  version: z.number(),
  status: z.string(),
  title: z.string(),
  summary: z.string(),
  citations: z.array(CitationOut),
  page_url: z.string(),
});
const RuleSummaryOut = z.looseObject({ id: z.string(), title: z.string(), status: z.string(), page_url: z.string() });

type EventFields = Partial<Pick<RulesApiEvent, 'rule_ids' | 'fact_names' | 'event_type' | 'missing_facts' | 'query' | 'result_count'>>;
interface ToolDeps {
  library: RulesLibrary;
  attribution: LinkAttribution;
}
interface ToolOutcome {
  result: CallToolResult;
  /** Analytics status: 200 ok, 400 validation, 404 not found, 500 internal, 503 unavailable. */
  status?: number;
  event?: EventFields;
}

/** Unknown fact names are echoed only when they look like fact names, never arbitrary text. */
const ECHOABLE_FACT = /^[a-z0-9_.]{1,60}$/;

export function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function ok(structured: Record<string, unknown>, text: string): CallToolResult {
  return { structuredContent: { ...structured, attribution: ATTRIBUTION }, content: [{ type: 'text', text }] };
}

function runTool(tool: string, ctx: ServerContext, work: (deps: ToolDeps) => ToolOutcome): CallToolResult {
  const started = Date.now();
  const client = clientFromContext(ctx);
  const caller = callerFromContext(ctx);

  let library: RulesLibrary;
  try {
    library = getLibrary();
  } catch (error) {
    if (!(error instanceof LibraryLoadError)) throw error;
    return errorResult('The rules library is temporarily unavailable. Try again shortly.');
  }

  let outcome: ToolOutcome;
  try {
    outcome = work({ library, attribution: { source: 'mcp', medium: client.name ?? 'unknown' } });
  } catch (error) {
    console.error(`[mcp] ${tool} failed:`, error);
    outcome = { result: errorResult('Something went wrong answering this request. Try again.'), status: 500 };
  }

  scheduleEvent({
    surface: 'mcp',
    endpoint: tool,
    status: outcome.status ?? (outcome.result.isError ? 400 : 200),
    client_name: client.name,
    client_version: client.version,
    tier: caller.tier,
    key_id: caller.tier === 'partner' ? caller.keyId : null,
    rule_ids: [],
    fact_names: [],
    event_type: null,
    missing_facts: [],
    query: null,
    result_count: 0,
    ...outcome.event,
    library_version: library.library_version,
    latency_ms: Date.now() - started,
  });
  return outcome.result;
}

export function registerRuleTools(server: McpServer): void {
  server.registerTool(
    'search_rules',
    {
      title: 'Search travel rules',
      description:
        "Search Elsewhere's verified travel rules (flight refunds and compensation, delays, bags, travel documents, card perks, hotel and booking rules) by keywords. Returns up to 10 rules with status and page_url. Use get_rule for full details and citations.",
      inputSchema: z.object({
        query: z.string().min(1).max(200),
        domain: z.enum(DOMAINS).optional(),
        jurisdiction: z.string().max(40).optional(),
      }),
      outputSchema: z.object({ rules: z.array(RuleSummaryOut), attribution: AttributionOut }),
      annotations: { title: 'Search travel rules', ...READ_ONLY },
    },
    async (args, ctx) =>
      runTool('search_rules', ctx, ({ library, attribution }) => {
        const rules = searchRules(library, { q: args.query, domain: args.domain, jurisdiction: args.jurisdiction, limit: 10 }).map(
          (r) => toRuleSummary(r, library, attribution),
        );
        return {
          result: ok({ rules }, searchText(rules)),
          event: { query: args.query, rule_ids: rules.map((r) => r.id), result_count: rules.length },
        };
      }),
  );

  server.registerTool(
    'get_rule',
    {
      title: 'Get a travel rule',
      description:
        "Get one verified travel rule by id: what you're owed, how to claim it, exceptions, and word-for-word citations from the primary source.",
      inputSchema: z.object({ id: RULE_ID }),
      outputSchema: z.object({ rule: PublicRuleOut, attribution: AttributionOut }),
      annotations: { title: 'Get a travel rule', ...READ_ONLY },
    },
    async (args, ctx) =>
      runTool('get_rule', ctx, ({ library, attribution }) => {
        const rule = library.rules.find((r) => r.id === args.id && isPublic(r));
        if (!rule) {
          return { result: errorResult(`No public rule with id "${args.id}". Use search_rules to find rule ids.`), status: 404 };
        }
        const pub = toPublicRule(rule, library, attribution);
        return { result: ok({ rule: pub }, ruleText(pub)), event: { rule_ids: [pub.id], result_count: 1 } };
      }),
  );

  server.registerTool(
    'match_situation',
    {
      title: 'Match a travel situation to rules',
      description:
        "Given facts about a traveler's situation (for example event.type=cancellation, flight.touches_us=true, passenger.accepted_alternative=false), return the rules that apply, the rules that may apply plus the facts still needed, and their citations. Call list_facts first for valid fact names and values.",
      // mcp-handler parses the body itself, so this schema is the only bound on the input.
      inputSchema: z.object({
        // Values are z.unknown() and every limit lives in one refine: the SDK echoes a failing record
        // key's path into its error message, which would echo an oversized key back.
        facts: z.record(z.string(), z.unknown()).refine(
          (facts) =>
            Object.keys(facts).length <= 30 &&
            Object.entries(facts).every(
              ([name, value]) =>
                name.length <= 60 &&
                (typeof value === 'boolean' || typeof value === 'number' || (typeof value === 'string' && value.length <= 100)),
            ),
          { message: 'At most 30 facts; names up to 60 characters; values must be text up to 100 characters, a number, or true/false.' },
        ),
      }),
      outputSchema: z.object({
        applies: z.array(PublicRuleOut),
        may_apply: z.array(PublicRuleOut.extend({ missing_facts: z.array(z.string()) })),
        does_not_apply_count: z.number(),
        attribution: AttributionOut,
      }),
      annotations: { title: 'Match a travel situation to rules', ...READ_ONLY },
    },
    async (args, ctx) =>
      runTool('match_situation', ctx, ({ library, attribution }) => {
        const parsed = parseSituation({ facts: args.facts });
        if (!parsed.ok) {
          return {
            result: errorResult(
              `Unknown or invalid facts: ${parsed.errors
                .map((e) => `${ECHOABLE_FACT.test(e.fact) ? e.fact : '(invalid name)'} (${e.message.replace(VOCABULARY_HINT, '').trim()})`)
                .join('; ')}. Call list_facts for valid names and values.`,
            ),
            status: 400,
            event: { fact_names: knownFactNames({ facts: args.facts }) },
          };
        }
        const result = matchSituation(library, parsed.situation, attribution);
        const eventType = parsed.situation['event.type'];
        return {
          result: ok({ ...result }, matchText(result)),
          event: {
            fact_names: Object.keys(parsed.situation),
            event_type: typeof eventType === 'string' ? eventType : null,
            rule_ids: [...result.applies, ...result.may_apply].map((r) => r.id),
            missing_facts: [...new Set(result.may_apply.flatMap((r) => r.missing_facts))],
            result_count: result.applies.length + result.may_apply.length,
          },
        };
      }),
  );

  server.registerTool(
    'list_facts',
    {
      title: 'List situation facts',
      description: 'List the fact names, types, and allowed values that match_situation accepts.',
      outputSchema: z.object({
        facts: z.array(z.looseObject({ name: z.string(), type: z.string(), description: z.string() })),
        attribution: AttributionOut,
      }),
      annotations: { title: 'List situation facts', ...READ_ONLY },
    },
    async (ctx) =>
      runTool('list_facts', ctx, () => {
        const facts = factsVocabulary();
        return { result: ok({ facts }, factsText(facts)), event: { result_count: facts.length } };
      }),
  );

  server.registerTool(
    'list_recent_changes',
    {
      title: 'List recent rule changes',
      description: 'List rules added, changed, sent for re-checking, or retired since a date (YYYY-MM-DD).',
      inputSchema: z.object({ since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
      outputSchema: z.object({
        since: z.string(),
        changes: z.array(z.looseObject({ rule_id: z.string(), kind: z.string(), date: z.string() })),
        attribution: AttributionOut,
      }),
      annotations: { title: 'List recent rule changes', ...READ_ONLY },
    },
    async (args, ctx) =>
      runTool('list_recent_changes', ctx, ({ library }) => {
        if (!isIsoDate(args.since)) return { result: errorResult('since must be a real date in YYYY-MM-DD form.'), status: 400 };
        const changes = publicChangesSince(library, args.since);
        return {
          result: ok({ since: args.since, changes }, changesText(args.since, changes)),
          event: { rule_ids: changes.map((c) => c.rule_id), result_count: changes.length },
        };
      }),
  );
}
