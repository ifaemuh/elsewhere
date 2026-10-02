'use client';

import Link from 'next/link';
import { recordFunnelEvent } from '@/app/actions/funnel';
import { Button } from '@/components/ui/button';

/** Records the click fire-and-forget; navigation proceeds as a normal Link (no preventDefault, no await). */
export function OfferCta({ ruleId }: { ruleId: string }) {
  const onClick = () => {
    const utm = Object.fromEntries(new URLSearchParams(window.location.search));
    void recordFunnelEvent({ event: 'offer_click', ruleId, utm });
  };
  return (
    <Button asChild className="mt-4">
      <Link href={`/start?rule=${encodeURIComponent(ruleId)}`} onClick={onClick}>
        Start a trip
      </Link>
    </Button>
  );
}
