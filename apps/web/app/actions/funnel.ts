'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { recordEvent } from '@/lib/funnel/events';
import { parseUtmCookie, pickUtm, UTM_COOKIE, UTM_COOKIE_OPTIONS } from '@/lib/funnel/utm';
import { assignVariant } from '@/lib/funnel/variant';

const Input = z.object({
  event: z.enum(['rule_page_view', 'offer_click']),
  ruleId: z.string().max(120).nullable(),
  utm: z.record(z.string(), z.string().max(100)).optional(),
});

export async function recordFunnelEvent(input: z.input<typeof Input>): Promise<void> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return;
  const store = await cookies();
  const anonymousId = store.get(ANONYMOUS_ID_COOKIE)?.value;
  if (!isAnonymousId(anonymousId)) return;

  // Last-touch UTM: a landing with UTM tags replaces the stored set; otherwise reuse it.
  const fresh = pickUtm(parsed.data.utm ?? {});
  const utm = Object.keys(fresh).length > 0 ? fresh : parseUtmCookie(store.get(UTM_COOKIE)?.value);
  if (Object.keys(fresh).length > 0) store.set(UTM_COOKIE, JSON.stringify(fresh), UTM_COOKIE_OPTIONS);

  await recordEvent({
    anonymousId,
    event: parsed.data.event,
    ruleId: parsed.data.ruleId,
    variant: assignVariant(anonymousId),
    utm,
  });
}
