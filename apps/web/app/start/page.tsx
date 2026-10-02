import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth/user';
import { recordOfferClickBackstop } from '@/lib/funnel/offer-click';
import { tripsOpen } from '@/lib/trips/open';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function StartPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Forward the bookings. We’ll watch the trip.</h1>
      <ol className="mt-8 list-decimal space-y-2 pl-6 text-lg text-[#4b5745]">
        <li>Create the trip and get its forwarding address.</li>
        <li>Forward the confirmation emails. We build the itinerary and check everyone’s documents, free.</li>
        <li>Add the trip pass and we watch every flight for the whole group.</li>
      </ol>
      <Suspense fallback={null}>
        <StartActions searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function StartActions({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rule = typeof params.rule === 'string' ? params.rule : undefined;
  // Backstop for the client's offer_click (modified clicks, hard navigations); deduped in the database.
  await recordOfferClickBackstop(rule, params);
  if (!tripsOpen()) {
    return (
      <p className="mt-10 rounded-xl border border-[#e4dfd0] bg-white p-6 text-lg">
        We’re opening trip watching to the first groups soon. Follow <strong>@go.elsewhere</strong> for the launch.
      </p>
    );
  }
  const user = await getCurrentUser();
  const href = user ? '/trips/new' : `/login?next=${encodeURIComponent('/trips/new')}`;
  return (
    <Button asChild size="lg" className="mt-10">
      <Link href={href}>Start a trip</Link>
    </Button>
  );
}
