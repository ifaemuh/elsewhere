import { FACTS, describeFact, factValueFits, type FactName, type Primitive, type Situation } from '@elsewhere/rules/core';

export interface FactError {
  fact: string;
  message: string;
}

const VOCABULARY_HINT = 'Call list_facts or GET /api/rules/facts for valid fact names and values.';
const MAX_ERRORS = 20;
const MAX_NAME_ECHO = 60;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own keys only: "constructor", "toString" and "__proto__" are never fact names. */
function isKnownFact(name: string): name is FactName {
  return Object.hasOwn(FACTS, name);
}

const clip = (name: string): string => (name.length > MAX_NAME_ECHO ? `${name.slice(0, MAX_NAME_ECHO)}...` : name);

export function parseSituation(input: unknown): { ok: true; situation: Situation } | { ok: false; errors: FactError[] } {
  if (!isPlainObject(input) || !isPlainObject(input.facts)) {
    return { ok: false, errors: [{ fact: '(body)', message: 'Expected { "facts": { "<fact>": <value> } }.' }] };
  }
  const entries = Object.entries(input.facts);
  if (entries.length === 0) {
    return { ok: false, errors: [{ fact: '(facts)', message: `Provide at least one fact. ${VOCABULARY_HINT}` }] };
  }

  const errors: FactError[] = [];
  // Null prototype: a "__proto__" key can never reach Object.prototype.
  const situation = Object.create(null) as Situation;
  for (const [name, value] of entries) {
    if (!isKnownFact(name)) {
      errors.push({ fact: clip(name), message: `Unknown fact. ${VOCABULARY_HINT}` });
    } else if (!['string', 'number', 'boolean'].includes(typeof value) || !factValueFits(name, value as Primitive)) {
      // Never echo the offered value: it may be arbitrarily large.
      errors.push({ fact: name, message: `Fact "${name}" expects ${describeFact(name)}.` });
    } else {
      situation[name] = value as Primitive;
    }
  }
  return errors.length > 0 ? { ok: false, errors: errors.slice(0, MAX_ERRORS) } : { ok: true, situation: { ...situation } };
}

/** Known fact names from an untrusted body, for analytics. Unknown names are never stored. */
export function knownFactNames(input: unknown): FactName[] {
  if (!isPlainObject(input) || !isPlainObject(input.facts)) return [];
  return Object.keys(input.facts).filter(isKnownFact);
}
