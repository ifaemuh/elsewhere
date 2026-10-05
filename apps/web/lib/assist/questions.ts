import { FACTS, factValueFits, isFactName, type MatchResult, type Primitive } from '@elsewhere/rules/core';

/** Thrown for an answer to a fact we never ask about, or a value the question does not offer. */
export class PlannerAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerAnswerError';
  }
}

/** The option that records a mixed group: it leaves the fact unset, so rules that turn on it stay "may apply". */
const MIXED = 'mixed';
const MIXED_OPTION = { value: MIXED, label: 'Some of us did, some didn’t' };

export interface PlannerQuestion {
  fact: string;
  prompt: string;
  options: { value: string; label: string }[];
}

export interface PlannerAnswer {
  fact: string;
  value: string;
}

/**
 * For a number fact, each option's value is the smallest number in its band, and the bands line up with the
 * rules' thresholds, so an answer never makes a rule apply that the real time might not.
 */
const ASKABLE: Record<string, Omit<PlannerQuestion, 'fact'>> = {
  'passenger.accepted_alternative': {
    prompt: 'Did anyone accept the airline’s new flight, the changed flight, or a travel credit?',
    options: [
      { value: 'false', label: 'No, not yet' },
      { value: 'true', label: 'Yes, we accepted it' },
      MIXED_OPTION,
    ],
  },
  'event.reroute_arrival_delay_minutes': {
    prompt: 'When does the airline’s new flight get you to your final destination, compared with your original arrival?',
    options: [
      { value: '0', label: 'At or before the original time' },
      { value: '1', label: 'Less than 2 hours later' },
      { value: '120', label: '2 hours or more but under 3 hours later' },
      { value: '180', label: '3 hours or more but under 4 hours later' },
      { value: '240', label: '4 hours or more later' },
      { value: '1440', label: 'The airline hasn’t offered a new flight' },
    ],
  },
  'event.reroute_departs_early_minutes': {
    prompt: 'Does the airline’s new flight leave earlier than your original flight?',
    options: [
      { value: '0', label: 'No, or no new flight was offered' },
      { value: '1', label: 'Up to 1 hour earlier' },
      { value: '61', label: 'More than 1 hour, up to 2 hours earlier' },
      { value: '121', label: 'More than 2 hours earlier' },
    ],
  },
  'passenger.volunteered': {
    prompt: 'Did anyone give up their seat when the airline asked for volunteers?',
    options: [
      { value: 'false', label: 'No, the airline took our seats' },
      { value: 'true', label: 'Yes, we volunteered' },
      MIXED_OPTION,
    ],
  },
  'event.cause': {
    prompt: 'Did the airline say why? Pick the closest.',
    options: [
      { value: 'controllable', label: 'Crew, maintenance, or another airline problem' },
      { value: 'uncontrollable', label: 'Weather, air traffic control, or security' },
      { value: 'unknown', label: 'They didn’t say' },
    ],
  },
  'trip.ticket_charged_by': {
    prompt: 'Who charged your card for the flights: the airline, or a travel agency or booking site?',
    options: [
      { value: 'airline', label: 'The airline' },
      { value: 'ticket_agent', label: 'A travel agency or booking site' },
      { value: MIXED, label: 'Not sure' },
    ],
  },
};

/**
 * The planner gets one question at a time, in this order, and only for facts a traveler can answer. The
 * re-routing questions come right after the rebooking one, while the airline's offer is in front of them.
 */
export const ASK_ORDER = [
  'passenger.accepted_alternative',
  'event.reroute_arrival_delay_minutes',
  'event.reroute_departs_early_minutes',
  'passenger.volunteered',
  'event.cause',
  'trip.ticket_charged_by',
] as const;

export function nextQuestion(results: MatchResult[], alreadyAsked: string[]): PlannerQuestion | null {
  const missing = new Set(results.filter((r) => r.outcome === 'may_apply').flatMap((r) => r.missing_facts as string[]));
  const fact = ASK_ORDER.find((f) => missing.has(f) && !alreadyAsked.includes(f));
  return fact ? { fact, ...ASKABLE[fact] } : null;
}

/** True for a stored answer that `answerValue` could have produced: a listed option, of the fact's own type. */
export function storedAnswerFits(fact: string, value: unknown): boolean {
  const question = ASKABLE[fact];
  if (!question || !(ASK_ORDER as readonly string[]).includes(fact) || !isFactName(fact) || !factValueFits(fact, value)) return false;
  return value !== MIXED && question.options.some((o) => o.value === String(value));
}

/**
 * The value of a planner's answer: a boolean for a yes/no fact, a number for a number fact, the option's own string for an enum fact. Undefined for "mixed",
 * which leaves the fact unset. Throws PlannerAnswerError for a fact we don't ask about or a value off the list.
 */
export function answerValue(answer: PlannerAnswer): Primitive | undefined {
  const question = ASKABLE[answer.fact];
  if (!(ASK_ORDER as readonly string[]).includes(answer.fact) || !question) throw new PlannerAnswerError(`${answer.fact} is not a question we ask`);
  if (!question.options.some((o) => o.value === answer.value)) throw new PlannerAnswerError(`${JSON.stringify(answer.value)} is not an option for ${answer.fact}`);
  if (answer.value === MIXED) return undefined;
  if (answer.value === 'true') return true;
  if (answer.value === 'false') return false;
  if (isFactName(answer.fact) && FACTS[answer.fact].type === 'number') return Number(answer.value);
  return answer.value;
}
