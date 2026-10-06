import { Button } from '@/components/ui/button';

export const INSTAGRAM_URL = 'https://www.instagram.com/go.elsewhere/';

/** Where a rule page points readers: the account the rules are posted from. */
export function FollowCard() {
  return (
    <aside className="mt-12 rounded-2xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="text-xl font-bold">Get the next rule before you need it</h2>
      <p className="mt-2 text-[#4b5745]">
        New travel rules every day, in plain English, from the group. Follow <strong>@go.elsewhere</strong>.
      </p>
      <Button asChild className="mt-4">
        <a href={INSTAGRAM_URL}>Follow on Instagram</a>
      </Button>
    </aside>
  );
}
