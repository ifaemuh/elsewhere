export interface JoinPreview {
  tripName: string;
  dates: string;
  travelerCount: number;
}

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const year = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'UTC' });

/** The only trip data a join link may reveal, including inside Messages or WhatsApp link previews. */
export function joinPreview(trip: { name: string; start_date: string | null; end_date: string | null }, memberCount: number): JoinPreview {
  const dates =
    trip.start_date && trip.end_date
      ? `${day.format(new Date(`${trip.start_date}T00:00:00Z`))} – ${day.format(new Date(`${trip.end_date}T00:00:00Z`))}, ${year.format(new Date(`${trip.end_date}T00:00:00Z`))}`
      : 'Dates to be set';
  return { tripName: trip.name, dates, travelerCount: memberCount };
}
