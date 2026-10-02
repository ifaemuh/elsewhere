'use client';

import { useEffect, useRef } from 'react';
import { recordFunnelEvent } from '@/app/actions/funnel';

/** Fires one funnel event per mount. Pages stay static, and the event rides a server action. */
export function FunnelBeacon({ event, ruleId }: { event: 'rule_page_view' | 'offer_click'; ruleId?: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const utm = Object.fromEntries(new URLSearchParams(window.location.search));
    void recordFunnelEvent({ event, ruleId: ruleId ?? null, utm });
  }, [event, ruleId]);
  return null;
}
