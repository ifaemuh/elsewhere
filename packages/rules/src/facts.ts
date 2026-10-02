export interface FactDef {
  type: 'enum' | 'number' | 'boolean' | 'string';
  values?: readonly string[];
  description: string;
}

const EVENT_TYPES = [
  'cancellation',
  'delay',
  'schedule_change',
  'denied_boarding',
  'downgrade',
  'missed_connection',
  'tarmac_delay',
  'bag_delayed',
  'bag_lost',
  'bag_damaged',
  'service_not_provided',
] as const;

export const FACTS = {
  'event.type': {
    type: 'enum',
    values: EVENT_TYPES,
    description:
      'What happened to the trip. denied_boarding: The airline did not let the passenger board a flight they held a confirmed reservation on ' +
      'because more passengers held confirmed reservations than there were seats. Not for refusals over documents, conduct or safety, or a cancelled flight.',
  },
  'event.delay_minutes': {
    type: 'number',
    description:
      'Length of the disruption in minutes. For delay, schedule_change, cancellation and missed_connection: ' +
      'how much later the passenger reaches the final destination than originally scheduled. ' +
      'For tarmac_delay: minutes on the tarmac without the chance to deplane. ' +
      'For bag_delayed: minutes since the flight arrived without the bag. ' +
      'For denied_boarding: minutes between when the original flight(s) were planned to arrive and when the replacement the airline offers is planned ' +
      '(when arranged) to arrive, at the first stopover (a planned stop over 4 hours) or else the final destination. Planned times, not actual. ' +
      'No replacement offered = 240 or more.',
  },
  'event.at_us_airport': {
    type: 'boolean',
    description:
      'The disruption happened at an airport in the United States, including territories and possessions. For tarmac_delay: where the aircraft was held on the ground.',
  },
  'event.notice_days': { type: 'number', description: 'Days between the airline telling the passenger and the scheduled departure.' },
  'event.cause': {
    type: 'enum',
    values: ['controllable', 'uncontrollable', 'unknown'],
    description: 'Whether the airline caused the disruption. "unknown" when the airline has not said.',
  },
  'flight.carrier_iata': { type: 'string', description: 'Two-character IATA code of the operating carrier.' },
  'flight.carrier_is_us': { type: 'boolean', description: 'The operating carrier is a US airline.' },
  'flight.touches_us': { type: 'boolean', description: 'The flight departs from or arrives at a US airport (including territories and possessions).' },
  'flight.is_domestic_us': { type: 'boolean', description: 'Both airports are in the United States (including territories and possessions).' },
  'flight.departs_eu': { type: 'boolean', description: 'The flight departs from an airport in an EU member state.' },
  'flight.arrives_eu': { type: 'boolean', description: 'The flight arrives at an airport in an EU member state.' },
  'flight.carrier_is_eu': { type: 'boolean', description: 'The operating carrier is licensed in an EU member state.' },
  'flight.departs_uk': { type: 'boolean', description: 'The flight departs from an airport in the United Kingdom.' },
  'flight.distance_km': { type: 'number', description: 'Great-circle distance between origin and final destination, in km.' },
  'flight.single_ticket': { type: 'boolean', description: 'All flights in the journey are on one ticket or booking reference.' },
  'flight.departs_us': { type: 'boolean', description: 'The flight departs from a US airport (including territories and possessions).' },
  'passenger.volunteered': {
    type: 'boolean',
    description:
      "The passenger gave up a confirmed seat by answering the airline's call for volunteers and accepting its offer. False if the airline chose them, even if they then accepted compensation.",
  },
  'passenger.accepted_alternative': {
    type: 'boolean',
    description: 'The passenger accepted the rebooking, the changed flight, or a voucher or credit.',
  },
  'passenger.nationality': { type: 'string', description: 'ISO 3166 alpha-2 code of the passport the passenger travels on.' },
  'passenger.passport_months_valid_after_return': {
    type: 'number',
    description: 'Whole months the passport stays valid after the return date.',
  },
  'passenger.has_real_id': { type: 'boolean', description: 'The passenger holds a REAL ID-compliant card or another accepted ID.' },
  'passenger.payment_card_issuer': { type: 'string', description: 'Issuer of the card used to pay, kebab-case (e.g. chase).' },
  'trip.destination_country': { type: 'string', description: 'ISO 3166 alpha-2 code of the destination country.' },
  'trip.booked_via': { type: 'enum', values: ['direct', 'ota'], description: 'Booked with the airline or hotel directly, or through an online travel agency, travel agent or other third party.' },
  'trip.hours_since_booking': { type: 'number', description: 'Hours since the booking was made.' },
  'trip.hours_booked_before_departure': {
    type: 'number',
    description: 'Hours between when the booking was made and the scheduled departure of the first flight on it.',
  },
  'trip.touches_us': {
    type: 'boolean',
    description: 'Any flight on the booking departs from or arrives at a US airport (including territories and possessions).',
  },
  'trip.booked_with_us_carrier': { type: 'boolean', description: 'The airline the booking was made with is a US airline.' },
  'trip.itinerary_domestic_us': {
    type: 'boolean',
    description:
      'Every flight on the ticket is within the United States (including territories and possessions). False when any flight on the ticket goes to or from another country, even if this flight is a domestic connection.',
  },
  'trip.us_foreign_nonstop_minutes': {
    type: 'number',
    description: "Scheduled minutes of the ticket's nonstop flight between the United States and a foreign point, on the same journey as the event.",
  },
  'lodging.kind': { type: 'enum', values: ['hotel', 'short_term_rental'], description: 'Kind of lodging.' },
  'lodging.booked_via': { type: 'enum', values: ['direct', 'ota'], description: 'Booked with the property directly, or through an online travel agency.' },
} as const satisfies Record<string, FactDef>;

export type FactName = keyof typeof FACTS;
/** Same shape as Partial<Record<FactName, Primitive>>; spelled out so facts.ts imports nothing. */
export type Situation = Partial<Record<FactName, string | number | boolean>>;

/** Internal: every fact name, as a tuple zod's enum accepts. */
export const FACT_NAMES = Object.keys(FACTS) as [FactName, ...FactName[]];

export class FactValueError extends Error {
  constructor(
    readonly fact: string,
    message: string,
  ) {
    super(message);
    this.name = 'FactValueError';
  }
}

export function isFactName(name: string): name is FactName {
  return Object.hasOwn(FACTS, name);
}

/** True when `value` fits the fact's declared type (and enum values). */
export function factValueFits(fact: FactName, value: unknown): boolean {
  const def: FactDef = FACTS[fact];
  switch (def.type) {
    case 'enum':
      return typeof value === 'string' && (def.values ?? []).includes(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
  }
}

export function describeFact(fact: FactName): string {
  const def: FactDef = FACTS[fact];
  return def.type === 'enum' ? `one of ${(def.values ?? []).join(', ')}` : `a ${def.type}`;
}

/** Throws FactValueError if a value doesn't fit its FactDef. */
export function validateSituation(situation: Situation): void {
  for (const [name, value] of Object.entries(situation)) {
    if (value === undefined) continue;
    if (!isFactName(name)) throw new FactValueError(name, `Unknown fact "${name}"`);
    if (!factValueFits(name, value)) {
      throw new FactValueError(name, `Fact "${name}" expects ${describeFact(name)}, got ${JSON.stringify(value)}`);
    }
  }
}
