import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { tripsOpen } from '@/lib/trips/open';
import { NewTripForm } from './new-trip-form';

export default function NewTripPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">New trip</h1>
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  if (!tripsOpen()) redirect('/start');
  await requireUser('/trips/new');
  return <NewTripForm />;
}
