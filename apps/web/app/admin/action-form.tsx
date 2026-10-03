'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionResult } from './actions';

/** A one-button form for an /admin action. The action's expected failures come back as text and show under the button. */
export function ActionForm({
  action,
  id,
  label,
  variant = 'outline',
}: {
  action: (id: string) => Promise<ActionResult>;
  id: string;
  label: string;
  variant?: 'outline' | 'default';
}) {
  const [state, run, pending] = useActionState<ActionResult>(() => action(id), { error: null });
  return (
    <form action={run} className="inline-block">
      <Button size="sm" variant={variant} type="submit" disabled={pending}>
        {pending ? 'Working…' : label}
      </Button>
      {state.error ? (
        <p role="alert" className="mt-1 max-w-xs text-sm text-[#b42318]">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
