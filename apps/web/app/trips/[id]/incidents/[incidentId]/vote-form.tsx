'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { createVote, type VoteFormState } from '../../votes/actions';

export function IncidentVoteForm({ tripId, incidentId, suggestions }: { tripId: string; incidentId: string; suggestions: string[] }) {
  const [state, action, pending] = useActionState<VoteFormState, FormData>(createVote.bind(null, tripId, incidentId), { error: null });
  return (
    <form action={action} className="mt-10 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Ask the group</h2>
      <input name="title" defaultValue="Which option should we take?" aria-label="The question" className="mt-3 w-full rounded-md border border-[#d9d3c2] px-3 py-2" />
      <textarea
        name="options"
        defaultValue={suggestions.join('\n')}
        aria-label="The options, one per line"
        placeholder={'One option per line, e.g.\nThe airline’s 7:05 tomorrow\nTonight via Denver'}
        className="mt-3 h-32 w-full rounded-md border border-[#d9d3c2] px-3 py-2 text-sm"
      />
      {state.error ? <p role="alert" className="mt-2 text-sm text-[#b42318]">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="mt-3">
        {pending ? 'Starting…' : 'Start the vote'}
      </Button>
    </form>
  );
}
