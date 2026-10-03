/** U.S. carriers, including regionals that operate for them. Extend by PR when a new code shows up in intake. */
export const US_CARRIERS = new Set([
  'AA', 'AS', 'B6', 'DL', 'F9', 'G4', 'HA', 'NK', 'SY', 'UA', 'WN', 'MX', 'XP',
  'QX', 'OO', 'YX', '9E', 'MQ', 'OH', 'YV', 'ZW', 'PT', 'G7', 'C5', 'AX', 'EM',
  '9K', '3M', 'KS', 'LF', '9X',
]);

/**
 * Community carriers for EU261 that U.S. travelers fly most. Extend by PR.
 * Left out on purpose, so their carrier facts stay unset: U2 (easyJet operates under UK, EU, and Swiss licences), SK (SAS also operates under a Norwegian AOC),
 * and DY (Norway) and LX (Switzerland), which are not licensed in an EU member state.
 */
export const EU_CARRIERS = new Set([
  'A3', 'AF', 'AY', 'AZ', 'BT', 'DE', 'D8', 'EI', 'EN', 'EW', 'FR', 'HV', 'IB', 'KL', 'LG', 'LH',
  'LO', 'OK', 'OS', 'RO', 'SN', 'TP', 'UX', 'V7', 'VY', 'W6', 'X3', '4Y',
  'TO', 'I2', 'NT', 'SS', 'BF', 'TX', 'UU', 'OU', 'KM', 'QS', 'FB', 'OA', 'YW',
]);

/**
 * Major carriers that are neither U.S. nor EU, with unambiguous licensing. Deliberately small: a code in none
 * of the three sets leaves both carrier facts unset rather than guessing "not U.S." or "not EU".
 */
export const KNOWN_OTHER_CARRIERS = new Set([
  'BA', 'VS', 'AC', 'WS', 'EK', 'QR', 'EY', 'TK', 'QF', 'NH', 'JL', 'SQ', 'CX', 'LA', 'AM', 'AV', 'CM', 'ET', 'SA',
]);

/** True for a U.S. carrier, false for a known non-U.S. one, null when the code is not in any set. */
export function isUsCarrier(code: string | null): boolean | null {
  if (!code) return null;
  if (US_CARRIERS.has(code)) return true;
  return EU_CARRIERS.has(code) || KNOWN_OTHER_CARRIERS.has(code) ? false : null;
}

/** True for an EU carrier, false for a known non-EU one, null when the code is not in any set. */
export function isEuCarrier(code: string | null): boolean | null {
  if (!code) return null;
  if (EU_CARRIERS.has(code)) return true;
  return US_CARRIERS.has(code) || KNOWN_OTHER_CARRIERS.has(code) ? false : null;
}
