import { withRulesApi } from '@/lib/rules-api/handle';
import { envelope, jsonOk } from '@/lib/rules-api/envelope';
import { factsVocabulary } from '@/lib/rules-api/facts-vocabulary';

export const GET = withRulesApi('facts', ({ req, library, caller }) => {
  const facts = factsVocabulary();
  return {
    response: jsonOk(req, library, envelope(library, { facts }), caller),
    event: { result_count: facts.length },
  };
});
