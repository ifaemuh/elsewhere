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
      'What happened to the trip. cancellation: the booked flight is not operated (including when the airline drops it and moves the passenger to a different flight), or the aircraft took off and returned without continuing; if the same flight still operates at another time, use schedule_change; if only this passenger is kept off it, see denied_boarding. denied_boarding: The airline did not let the passenger board a flight they held a confirmed reservation on ' +
      'because more passengers held confirmed reservations than there were seats. Not for refusals over documents, or over the passenger\'s own conduct, safety, security or health risk, or a cancelled flight.',
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
      'The replacement must be a confirmed reservation at no extra charge. A standby offer, or a seat the passenger pays for, counts as no replacement. No replacement offered = 240 or more.',
  },
  'event.at_us_airport': {
    type: 'boolean',
    description:
      'The disruption happened at an airport in the United States, including territories and possessions. For tarmac_delay: where the aircraft was held on the ground.',
  },
  'event.notice_days': { type: 'number', description: 'Days between the airline telling the passenger and the scheduled departure; may be fractional; measured from when the airline told the passenger to the scheduled departure time; do not round up.' },
  'event.cause': {
    type: 'enum',
    values: ['controllable', 'uncontrollable', 'unknown'],
    description: 'Whether the airline caused the disruption. "unknown" when the airline has not said.',
  },
  'event.reroute_departs_early_minutes': {
    type: 'number',
    description:
      "For cancellation and schedule_change: how many minutes before the cancelled or changed flight's scheduled departure the re-routing the airline offered is scheduled to leave; 0 if at or after it. Planned times. For a schedule change, the changed flight itself counts as a re-routing offer, alongside any other the airline offered. If several offers were made, report the offer that departs no more than 1 hour (notice under 7 days) or 2 hours (notice 7 to under 14 days) earlier and arrives soonest. If no offer meets the departure limit, report any of them. No re-routing offered = 0.",
  },
  'event.reroute_arrival_delay_minutes': {
    type: 'number',
    description:
      'For cancellation and schedule_change: how many minutes after the originally scheduled arrival at the final destination that same offered re-routing is scheduled to arrive; 0 if it arrives at or before the original arrival. Planned times, not actual. For a schedule change, the changed flight itself counts as a re-routing offer, alongside any other the airline offered. No re-routing offered = 1440 or more.',
  },
  'event.departure_delay_minutes': {
    type: 'number',
    description:
      'For delay: minutes after its scheduled departure that the disrupted flight leaves, or is expected by the airline to leave while the passenger waits. That flight only, not the journey. If the airline\'s expected delay and the actual delay differ, report the longer one; Article 6 turns on what the airline reasonably expects.',
  },
  'event.departure_moved_earlier_minutes': {
    type: 'number',
    description: 'For schedule_change: how many minutes earlier than originally scheduled the flight now departs; 0 if not earlier.',
  },
  'flight.leg_distance_km': {
    type: 'number',
    description: 'Great-circle distance in km between the departure and arrival airports of the disrupted flight itself, not the whole journey.',
  },
  'flight.departs_iceland_norway_switzerland': {
    type: 'boolean',
    description: 'The flight departs from an airport in Iceland, Norway or Switzerland. Describes the disrupted flight; for missed_connection, the flight whose delay caused it.',
  },
  'trip.journey_departs_eu': {
    type: 'boolean',
    description:
      "The passenger's journey in this direction starts at an airport in the EU. A journey is the flights on one booking that take the passenger to the final destination; outbound and return are separate journeys.",
  },
  'trip.journey_arrives_eu': {
    type: 'boolean',
    description: "The passenger's journey in this direction ends at an airport in the EU (same journey definition).",
  },
  'flight.carrier_iata': { type: 'string', description: 'Two-character IATA code of the operating carrier. Flight facts describe the disrupted flight; for missed_connection, the flight whose delay caused the miss.' },
  'flight.marketing_carrier_iata': {
    type: 'string',
    description:
      'Two-character IATA code of the airline whose flight number is on the passenger\'s ticket for the disrupted flight (the marketing carrier). ' +
      'Differs from flight.carrier_iata on regional and codeshare flights. Flight facts describe the disrupted flight; for missed_connection, the flight whose delay caused the miss.',
  },
  'flight.carrier_is_us': { type: 'boolean', description: 'The operating carrier is a US airline. Flight facts describe the disrupted flight; for missed_connection, the flight whose delay caused the miss.' },
  'flight.touches_us': { type: 'boolean', description: 'The flight departs from or arrives at a US airport (including territories and possessions), as scheduled; a diversion does not count. Flight facts describe the disrupted flight; for missed_connection, the flight whose delay caused the miss.' },
  'flight.is_domestic_us': { type: 'boolean', description: 'Both airports are in the United States (including territories and possessions). Flight facts describe the disrupted flight; for missed_connection, the flight whose delay caused the miss.' },
  'flight.departs_eu': { type: 'boolean', description: 'The flight departs from an airport in an EU member state, EU as the Commission\'s guidance defines it (EU countries including outermost regions such as Guadeloupe and the Canary Islands; not the Faroe Islands). Flight facts describe the disrupted flight; for missed_connection, the flight whose delay caused the miss.' },
  'flight.arrives_eu': { type: 'boolean', description: 'The flight arrives at an airport in an EU member state, EU as the Commission\'s guidance defines it (EU countries including outermost regions such as Guadeloupe and the Canary Islands; not the Faroe Islands). Flight facts describe the disrupted flight; for missed_connection, the flight whose delay caused the miss.' },
  'flight.carrier_is_eu': { type: 'boolean', description: 'The operating carrier is licensed in an EU member state. Flight facts describe the disrupted flight; for missed_connection, the flight whose delay caused the miss.' },
  'flight.departs_uk': { type: 'boolean', description: 'The flight departs from an airport in the United Kingdom. Flight facts describe the disrupted flight; for missed_connection, the flight whose delay caused the miss.' },
  'flight.distance_km': { type: 'number', description: 'Great-circle distance in km from the journey\'s first departure airport to its final destination; outbound and return are separate journeys.' },
  'flight.single_ticket': { type: 'boolean', description: 'All flights in the journey are on one ticket or booking reference.' },
  'flight.departs_us': { type: 'boolean', description: 'The flight departs from a US airport (including territories and possessions). Flight facts describe the disrupted flight; for missed_connection, the flight whose delay caused the miss.' },
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
  'trip.ticket_charged_by': {
    type: 'enum',
    values: ['airline', 'ticket_agent'],
    description: 'Who charged the passenger for the flight ticket, as shown on the card or bank statement (the merchant of record): the airline, or a ticket agent such as a travel agent or online travel agency.',
  },
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
    description: "Scheduled minutes of the ticket's nonstop flight between the United States (including territories and possessions) and a foreign point, on the same journey as the event.",
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
