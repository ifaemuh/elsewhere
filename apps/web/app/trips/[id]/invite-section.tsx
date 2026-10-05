import { Button } from '@/components/ui/button';
import { currentJoinLink, resetJoinLink } from './actions';

/** Degrades, never crashes: a missing JOIN_LINK_SECRET or a link error leaves a note, not a broken trip page. */
export async function InviteSection({ tripId, isPlanner, failed }: { tripId: string; isPlanner: boolean; failed: boolean }) {
  if (!isPlanner) return null;
  let link: string | null = null;
  let available = true;
  try {
    link = await currentJoinLink(tripId);
  } catch (error) {
    console.error('currentJoinLink failed', error instanceof Error ? error.message : 'unknown error');
    available = false;
  }
  return (
    <section className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Invite the group</h2>
      {!available ? (
        <p className="mt-2 text-sm text-[#4b5745]">Invite links aren&apos;t available right now.</p>
      ) : (
        <>
          {link ? (
            <p className="mt-2 break-all font-mono text-sm">{link}</p>
          ) : (
            <p className="mt-2 text-sm text-[#4b5745]">Create a link and drop it in the group chat. Anyone with it can join until a week after the trip.</p>
          )}
          {failed ? (
            <p role="alert" className="mt-2 text-sm text-[#b42318]">
              We couldn&apos;t make a new link just now. Check the trip dates, then try again.
            </p>
          ) : null}
          <form action={resetJoinLink.bind(null, tripId)} className="mt-3">
            <Button type="submit" variant="outline">
              {link ? 'Reset the link' : 'Create invite link'}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
