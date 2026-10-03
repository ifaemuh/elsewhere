/** U.S. airports for the rules, including territories and possessions: Puerto Rico, the U.S. Virgin Islands, Guam, American Samoa, and the Northern Mariana Islands. */
export const US_JURISDICTION = new Set(['US', 'PR', 'VI', 'GU', 'AS', 'MP']);

/**
 * EU member states, as the Commission's EU261 guidance defines the EU: the 27 states with their outermost
 * regions. The Canary Islands (ES), the Azores and Madeira (PT) share their state's code; Guadeloupe,
 * Martinique, French Guiana, Réunion, Mayotte, and Saint-Martin have codes of their own. Not the Faroe
 * Islands (FO) or Greenland (GL), and not Iceland, Norway, or Switzerland, which have their own fact.
 */
export const EU_MEMBER_STATES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'GP', 'MQ', 'GF', 'RE', 'YT', 'MF',
]);

/** EU261 also covers departures from these three (`flight.departs_iceland_norway_switzerland`). */
export const ICELAND_NORWAY_SWITZERLAND = new Set(['IS', 'NO', 'CH']);

export const UK = new Set(['GB']);
