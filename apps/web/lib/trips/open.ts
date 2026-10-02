/** Trip creation opens when C2's intake ships. Until then the offer collects clicks only. */
export function tripsOpen(): boolean {
  return process.env.TRIPS_OPEN === 'true';
}
