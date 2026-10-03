'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { editPlaybook, type EditState } from './actions';

export function PlaybookEditor({ incidentId, json }: { incidentId: string; json: string }) {
  const [state, action, pending] = useActionState<EditState, FormData>(editPlaybook.bind(null, incidentId), { error: null, saved: false });
  return (
    <form action={action} className="mt-2">
      <textarea name="playbook" defaultValue={json} className="h-64 w-full rounded-md border border-[#d9d3c2] p-2 font-mono text-xs" />
      {state.error ? <p role="alert" className="text-sm text-[#b42318]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm text-[#2f6b2a]">Saved as a new version.</p> : null}
      <Button type="submit" size="sm" disabled={pending} className="mt-2">
        {pending ? 'Checking…' : 'Save edit'}
      </Button>
    </form>
  );
}
