import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Track B's pinned contract. Strict: no extra keys at any level. */
export const AttributionResponseSchema = z
  .object({
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    generated_at: z.iso.datetime(),
    posts: z.array(
      z
        .object({
          post_id: z.string(),
          clicks: z.number().int().nonnegative(),
          forwarded_bookings: z.number().int().nonnegative(),
          paid_passes: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();

export type AttributionResponse = z.infer<typeof AttributionResponseSchema>;

export function authorizedFoundry(header: string | null, key: string | undefined): boolean {
  if (!key || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** YYYY-MM-DD only, and it must be a real calendar date. */
export function parseSince(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function toAttributionResponse(
  since: string,
  rows: { post_id: string; clicks: number | string; forwarded_bookings: number | string; paid_passes: number | string }[],
): AttributionResponse {
  return {
    since,
    generated_at: new Date().toISOString(),
    posts: rows.map((row) => ({
      post_id: row.post_id,
      clicks: Number(row.clicks),
      forwarded_bookings: Number(row.forwarded_bookings),
      paid_passes: Number(row.paid_passes),
    })),
  };
}
