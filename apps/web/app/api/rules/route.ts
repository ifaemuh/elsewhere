import { withRulesApi } from '@/lib/rules-api/handle';
import { envelope, jsonError, jsonOk } from '@/lib/rules-api/envelope';
import { toRuleSummary } from '@/lib/rules-api/projection';
import { parseSearchParams, searchRules } from '@/lib/rules-api/search';

export const GET = withRulesApi('search', ({ req, library, caller, attribution }) => {
  const parsed = parseSearchParams(new URL(req.url));
  if (!parsed.ok) return { response: jsonError(400, 'invalid_query', parsed.message, { library }) };

  const rules = searchRules(library, parsed.params).map((r) => toRuleSummary(r, library, attribution));
  return {
    response: jsonOk(req, library, envelope(library, { rules, count: rules.length }), caller),
    event: { query: parsed.params.q ?? null, rule_ids: rules.map((r) => r.id), result_count: rules.length },
  };
});
