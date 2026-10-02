import { Suspense } from 'react';
import Link from 'next/link';
import { Character } from '@/components/character';
import { requireUser } from '@/lib/auth/user';
import { createClient } from '@/lib/supabase/server';

export default function TripsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Your trips</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading your trips…</p>}>
        <TripList />
      </Suspense>
    </main>
  );
}

async function TripList() {
  await requireUser('/trips');
  const supabase = await createClient();
  const { data: trips } = await supabase.from('trips').select('id, name, start_date, end_date').order('start_date', { ascending: true });
  if (!trips || trips.length === 0) {
    return (
      <div className="mt-10 flex items-center gap-4 rounded-xl border border-[#e4dfd0] bg-white p-6">
        <Character character="capybara" variant="avatar" width={56} />
        <div>
          <p className="font-medium">No trips yet. Nothing to worry about.</p>
          <Link href="/trips/new" className="text-[#b4532a] underline">Start one</Link>
        </div>
      </div>
    );
  }
  return (
    <ul className="mt-6 space-y-3">
      {trips.map((trip) => (
        <li key={trip.id}>
          <Link href={`/trips/${trip.id}`} className="block rounded-xl border border-[#e4dfd0] bg-white p-4 hover:border-[#b4532a]">
            <span className="font-medium">{trip.name}</span>
            <span className="ml-2 text-sm text-[#4b5745]">
              {trip.start_date} → {trip.end_date}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
