import { withRulesApi } from '@/lib/rules-api/handle';
import { jsonOk } from '@/lib/rules-api/envelope';
import { isPublic } from '@/lib/rules-api/projection';
import { ATTRIBUTION } from '@/lib/rules-api/types';

// The artifact shape (same as packages/rules/dist/rules.json), minus drafts.
// Foundry reads this with RULES_SOURCE=url:.
export const GET = withRulesApi('rules.json', ({ req, library, caller }) => {
  const publicIds = new Set(library.rules.filter(isPublic).map((r) => r.id));
  const rules = library.rules.filter((r) => publicIds.has(r.id));
  const body = {
    schema_version: library.schema_version,
    library_version: library.library_version,
    generated_at: library.generated_at,
    rules,
    changes: library.changes.filter((c) => publicIds.has(c.rule_id) && c.to_status !== 'draft'),
    sources: library.sources,
    attribution: ATTRIBUTION,
  };
  return { response: jsonOk(req, library, body, caller), event: { result_count: rules.length } };
});
