import { Button } from '@/components/ui/button';

export const HANDLE = '@go.else.where';
export const INSTAGRAM_URL = 'https://www.instagram.com/go.else.where/';
export const TIKTOK_URL = 'https://www.tiktok.com/@go.else.where';

/** Where a rule page points readers: the accounts the rules are posted from. */
export function FollowCard() {
  return (
    <aside className="mt-12 rounded-2xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="text-xl font-bold">Get the next rule before you need it</h2>
      <p className="mt-2 text-[#4b5745]">
        New travel rules every day, in plain English, from the group. Follow <strong>{HANDLE}</strong>.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button asChild>
          <a href={INSTAGRAM_URL}>Follow on Instagram</a>
        </Button>
        <Button asChild variant="outline">
          <a href={TIKTOK_URL}>Follow on TikTok</a>
        </Button>
      </div>
    </aside>
  );
}
