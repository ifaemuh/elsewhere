import { withRulesApi } from '@/lib/rules-api/handle';
import { envelope, jsonError, jsonOk } from '@/lib/rules-api/envelope';
import { isPublic, toPublicRule } from '@/lib/rules-api/projection';

export const GET = withRulesApi('get', ({ req, library, caller, attribution, params }) => {
  const rule = library.rules.find((r) => r.id === params.id && isPublic(r));
  if (!rule) {
    // Drafts and unknown ids get the identical response; the message never echoes the id.
    return { response: jsonError(404, 'not_found', 'No public rule with that id.', { library }) };
  }
  const data = { rule: toPublicRule(rule, library, attribution) };
  return {
    response: jsonOk(req, library, envelope(library, data), caller),
    event: { rule_ids: [rule.id], result_count: 1 },
  };
});
