import { isCronRequest } from '@/lib/cron-auth';
import { flushDue } from '@/lib/notify/queue';

export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request)) return new Response('unauthorized', { status: 401 });
  return Response.json({ sent: await flushDue() });
}
