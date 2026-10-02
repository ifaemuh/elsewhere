import { z } from 'zod';

const NewTripSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the trip a name.').max(80),
    destinationCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use the two-letter country code, like PT.'),
    startDate: z.iso.date('Pick a start date.'),
    endDate: z.iso.date('Pick an end date.'),
    displayName: z.string().trim().min(1, 'Add your name.').max(80),
  })
  .refine((trip) => trip.endDate >= trip.startDate, { message: 'The trip has to end on or after it starts.', path: ['endDate'] });

export type NewTrip = z.infer<typeof NewTripSchema>;

export function parseNewTrip(form: FormData): { success: true; data: NewTrip } | { success: false; error: string } {
  const parsed = NewTripSchema.safeParse({
    name: form.get('name') ?? '',
    destinationCountry: form.get('destinationCountry') ?? '',
    startDate: form.get('startDate') ?? '',
    endDate: form.get('endDate') ?? '',
    displayName: form.get('displayName') ?? '',
  });
  return parsed.success ? { success: true, data: parsed.data } : { success: false, error: parsed.error.issues[0].message };
}
