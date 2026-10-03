import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';
import { tally } from '@/lib/votes/tally';
import { closeVote, respondVote } from '../actions';

type Params = Promise<{ id: string; voteId: string }>;

export default function VotePage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <Suspense fallback={<p className="text-[#4b5745]">Loading the vote…</p>}>
        <VoteContent params={params} />
      </Suspense>
    </main>
  );
}

async function VoteContent({ params }: { params: Params }) {
  const { id, voteId } = await params;
  const user = await requireUser(`/trips/${id}/votes/${voteId}`);
  const supabase = await createClient();
  const { data: vote } = await supabase.from('votes').select('id, trip_id, title, detail, deadline, status, required_user_ids, created_by').eq('id', voteId).eq('trip_id', id).maybeSingle();
  if (!vote) notFound();
  const { data: options } = await supabase.from('vote_options').select('id, label, note, position').eq('vote_id', voteId);
  const { data: responses } = await supabase.from('vote_responses').select('user_id, option_id').eq('vote_id', voteId);
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: id });
  const result = tally(vote, options ?? [], responses ?? [], vote.required_user_ids);
  const mine = (responses ?? []).find((r) => r.user_id === user.id)?.option_id ?? null;
  const notes = new Map((options ?? []).map((o) => [o.id, o.note]));
  // Mirrors respond_vote: a vote that names its voters is theirs alone.
  const canVote = vote.status === 'open' && (vote.required_user_ids.length === 0 || vote.required_user_ids.includes(user.id));

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{vote.title}</h1>
      {vote.detail ? <p className="mt-2 text-[#4b5745]">{vote.detail}</p> : null}
      <ul className="mt-6 space-y-3">
        {result.options.map((option) => (
          <li key={option.id}>
            <form action={respondVote.bind(null, id, voteId, option.id)}>
              <Button type="submit" variant={mine === option.id ? 'default' : 'outline'} disabled={!canVote} className="h-auto w-full justify-between py-3">
                <span className="text-left">
                  {option.label}
                  {notes.get(option.id) ? <span className="block text-xs font-normal opacity-80">{notes.get(option.id)}</span> : null}
                  {option.id === result.leaderOptionId ? <span className="block text-xs font-semibold">Leading</span> : null}
                </span>
                <span>{option.votes}</span>
              </Button>
            </form>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-[#4b5745]">
        {result.respondedCount} of {result.requiredParticipantIds.length} have voted{vote.status === 'closed' ? ' · closed' : ''}.
      </p>
      {vote.status === 'open' && !canVote ? <p className="mt-1 text-sm text-[#4b5745]">This vote is for the travelers on the affected flight.</p> : null}
      {vote.status === 'open' && (isPlanner === true || vote.created_by === user.id) ? (
        <form action={closeVote.bind(null, id, voteId)} className="mt-4">
          <Button type="submit" variant="outline" size="sm">
            Close the vote
          </Button>
        </form>
      ) : null}
    </>
  );
}
