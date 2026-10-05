'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { markSettled, type SettleState } from './actions';

export function MarkPaidButton({ tripId, from, to, amountCents, settleKey }: { tripId: string; from: string; to: string; amountCents: number; settleKey: string }) {
  const [state, action, pending] = useActionState<SettleState, FormData>(markSettled.bind(null, tripId, from, to, amountCents, settleKey) as (prev: SettleState, form: FormData) => Promise<SettleState>, { error: null });
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? 'Marking…' : 'Mark paid'}
      </Button>
      {state.error ? <p role="alert" className="max-w-56 text-right text-xs text-[#b42318]">{state.error}</p> : null}
    </form>
  );
}
