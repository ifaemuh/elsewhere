export interface ManualFlight {
  carrierIata: string;
  flightNumber: string;
  departureLocal: string;
  originIata: string;
  destinationIata: string;
  confirmationCode: string | null;
}

export function parseManualFlight(form: FormData): { success: true; data: ManualFlight } | { success: false; error: string } {
  const flight = String(form.get('flight') ?? '').toUpperCase().replace(/\s+/g, '');
  const match = flight.match(/^([A-Z0-9]{2})(\d{1,4})$/);
  if (!match) return { success: false, error: 'Enter the flight like “TP 204”.' };
  const date = String(form.get('date') ?? '');
  const time = String(form.get('time') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { success: false, error: 'Add the departure date and local time.' };
  const from = String(form.get('from') ?? '').trim().toUpperCase();
  const to = String(form.get('to') ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return { success: false, error: 'Use three-letter airport codes, like EWR and LIS.' };
  const code = String(form.get('code') ?? '').trim().toUpperCase();
  return {
    success: true,
    data: { carrierIata: match[1], flightNumber: match[2].replace(/^0+(?=\d)/, ''), departureLocal: `${date}T${time}`, originIata: from, destinationIata: to, confirmationCode: code || null },
  };
}
