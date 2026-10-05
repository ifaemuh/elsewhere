import { withRulesApi } from '@/lib/rules-api/handle';
import { envelope, jsonError, jsonOk } from '@/lib/rules-api/envelope';
import { defaultSince, isIsoDate, publicChangesSince } from '@/lib/rules-api/changes';

export const GET = withRulesApi('changes', ({ req, library, caller }) => {
  const since = new URL(req.url).searchParams.get('since') ?? defaultSince();
  if (!isIsoDate(since)) {
    return { response: jsonError(400, 'invalid_since', 'since must be a date in YYYY-MM-DD form.', { library }) };
  }
  const changes = publicChangesSince(library, since);
  return {
    response: jsonOk(req, library, envelope(library, { since, changes }), caller),
    event: { rule_ids: changes.map((c) => c.rule_id), result_count: changes.length },
  };
});
