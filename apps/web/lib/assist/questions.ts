import { FACTS, isFactName, type MatchResult, type Primitive } from '@elsewhere/rules/core';

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
 * For a number fact, each option's value is the smallest number in its band, so an answer never makes a rule
 * apply that the real time might not.
 */
const ASKABLE: Record<string, Omit<PlannerQuestion, 'fact'>> = {
  'passenger.accepted_alternative': {
    prompt: 'Did anyone accept the airline’s new flight or a travel credit?',
    options: [
      { value: 'false', label: 'No, not yet' },
      { value: 'true', label: 'Yes, we accepted it' },
    ],
  },
  'event.reroute_arrival_delay_minutes': {
    prompt: 'When does the airline’s new flight get you to your final destination, compared with your original arrival?',
    options: [
      { value: '0', label: 'At or before the original time' },
      { value: '1', label: 'Less than 2 hours later' },
      { value: '120', label: '2 to 3 hours later' },
      { value: '180', label: '3 to 4 hours later' },
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
] as const;

export function nextQuestion(results: MatchResult[], alreadyAsked: string[]): PlannerQuestion | null {
  const missing = new Set(results.filter((r) => r.outcome === 'may_apply').flatMap((r) => r.missing_facts as string[]));
  const fact = ASK_ORDER.find((f) => missing.has(f) && !alreadyAsked.includes(f));
  return fact ? { fact, ...ASKABLE[fact] } : null;
}

export function answerValue(answer: PlannerAnswer): Primitive {
  if (answer.value === 'true') return true;
  if (answer.value === 'false') return false;
  if (isFactName(answer.fact) && FACTS[answer.fact].type === 'number') return Number(answer.value);
  return answer.value;
}
