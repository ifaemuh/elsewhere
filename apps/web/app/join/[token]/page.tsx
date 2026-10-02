import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Character } from '@/components/character';
import { smsEnabled } from '@/lib/auth/phone';
import { getCurrentUser } from '@/lib/auth/user';
import { CHARACTER_NAMES } from '@/lib/characters';
import { findJoinableTrip } from '@/lib/trips/join-lookup';
import { joinPreview } from '@/lib/trips/join-preview';
import { LoginForm } from '@/app/login/login-form';
import { JoinForm } from './join-form';

type Params = Promise<{ token: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await findJoinableTrip((await params).token);
  if (!found) return { title: 'Elsewhere invite' };
  const preview = joinPreview(found.trip, found.memberCount);
  return {
    title: `${preview.tripName} · you’re invited`,
    description: `${preview.travelerCount} traveler${preview.travelerCount === 1 ? '' : 's'} · ${preview.dates}`,
    robots: { index: false },
  };
}

export default function JoinPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <div className="flex justify-center gap-2" aria-hidden>
        {CHARACTER_NAMES.map((character) => (
          <Character key={character} character={character} variant="avatar" width={56} />
        ))}
      </div>
      <Suspense fallback={<p className="mt-8 text-center text-[#4b5745]">Opening the invite…</p>}>
        <JoinContent params={params} />
      </Suspense>
    </main>
  );
}

async function JoinContent({ params }: { params: Params }) {
  const { token } = await params;
  const found = await findJoinableTrip(token);
  if (!found) {
    return (
      <p className="mt-8 text-center text-lg">This invite link has expired. Ask the planner to send a new one.</p>
    );
  }
  const preview = joinPreview(found.trip, found.memberCount);
  const user = await getCurrentUser();
  return (
    <>
      <h1 className="mt-6 text-center text-3xl font-bold tracking-tight">{preview.tripName}</h1>
      <p className="mt-2 text-center text-[#4b5745]">
        {preview.dates} · {preview.travelerCount} traveler{preview.travelerCount === 1 ? '' : 's'} so far
      </p>
      <p className="mt-4 text-center">Join to see the plan and get told what you’re owed if a flight goes sideways.</p>
      {user ? (
        <JoinForm token={token} offerSms={smsEnabled() && Boolean(user.phone)} />
      ) : (
        <LoginForm next={`/join/${token}`} initialContact="" initialStep="contact" phoneAvailable={smsEnabled()} />
      )}
    </>
  );
}
