import { withRulesApi } from '@/lib/rules-api/handle';
import { jsonOk } from '@/lib/rules-api/envelope';
import { publicChanges } from '@/lib/rules-api/changes';
import { publicArtifactRules } from '@/lib/rules-api/projection';
import { ATTRIBUTION } from '@/lib/rules-api/types';

// The artifact shape (same as packages/rules/dist/rules.json), minus drafts.
// Foundry reads this with RULES_SOURCE=url:.
export const GET = withRulesApi('rules.json', ({ req, library, caller }) => {
  const rules = publicArtifactRules(library);
  // Only sources cited by a returned rule: a draft-only source would reveal what an unpublished rule is about.
  const citedSources = new Set(rules.flatMap((r) => r.sources.map((ref) => ref.source)));
  const sources = Object.fromEntries(Object.entries(library.sources).filter(([key]) => citedSources.has(key)));
  const body = {
    schema_version: library.schema_version,
    // The dist artifact's hash, deliberately NOT recomputed after dropping drafts: Foundry compares
    // this value to the dist build's, and the ETag is derived from it too.
    library_version: library.library_version,
    generated_at: library.generated_at,
    rules,
    changes: publicChanges(library),
    sources,
    attribution: ATTRIBUTION,
  };
  return { response: jsonOk(req, library, body, caller), event: { result_count: rules.length } };
});
