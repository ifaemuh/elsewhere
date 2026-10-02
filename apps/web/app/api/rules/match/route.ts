import { withRulesApi } from '@/lib/rules-api/handle';
import { envelope, jsonError, jsonOk } from '@/lib/rules-api/envelope';
import { matchSituation } from '@/lib/rules-api/match-situation';
import { knownFactNames, parseSituation } from '@/lib/rules-api/situation';

const MAX_BODY_BYTES = 16 * 1024;

/** Reads the body as text without buffering more than the limit. Returns null when too large. */
async function readBounded(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export const POST = withRulesApi('match', async ({ req, library, caller, attribution }) => {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return { response: jsonError(415, 'unsupported_media_type', 'Send the request as application/json.', { library }) };
  }
  const text = await readBounded(req);
  if (text === null) {
    return { response: jsonError(413, 'body_too_large', 'The request body is too large (limit 16 KB).', { library }) };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { response: jsonError(400, 'invalid_json', 'The request body must be JSON.', { library }) };
  }

  const parsed = parseSituation(body);
  if (!parsed.ok) {
    return {
      response: jsonError(400, 'invalid_facts', 'Some facts are unknown or have the wrong type. See GET /api/rules/facts.', {
        library,
        details: { errors: parsed.errors },
      }),
      event: { fact_names: knownFactNames(body) },
    };
  }

  const result = matchSituation(library, parsed.situation, attribution);
  const eventType = parsed.situation['event.type'];
  return {
    response: jsonOk(req, library, envelope(library, result), caller, { cacheable: false }),
    event: {
      fact_names: Object.keys(parsed.situation),
      event_type: typeof eventType === 'string' ? eventType : null,
      rule_ids: [...result.applies, ...result.may_apply].map((r) => r.id),
      missing_facts: [...new Set(result.may_apply.flatMap((r) => r.missing_facts))],
      result_count: result.applies.length + result.may_apply.length,
    },
  };
});
