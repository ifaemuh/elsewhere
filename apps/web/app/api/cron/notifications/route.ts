import { createHash, timingSafeEqual } from 'node:crypto';
import { flushDue } from '@/lib/notify/queue';

const digest = (value: string) => createHash('sha256').update(value).digest();

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  // An unset or empty secret must never turn "Bearer undefined" into a valid token.
  // Hashing first gives timingSafeEqual equal-length inputs, so the comparison is constant time.
  if (!secret || !timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`))) {
    return new Response('unauthorized', { status: 401 });
  }
  return Response.json({ sent: await flushDue() });
}
