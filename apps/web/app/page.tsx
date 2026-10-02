import Image from 'next/image';
import Link from 'next/link';
import { Character } from '@/components/character';
import { Button } from '@/components/ui/button';
import { CHARACTER_INFO, CHARACTER_NAMES } from '@/lib/characters';

const STEPS = [
  { title: 'Forward the bookings', body: 'Send the confirmation emails to your trip’s address. We build the itinerary.' },
  { title: 'Drop one link in the group chat', body: 'Everyone joins in a browser. Nobody installs anything.' },
  { title: 'We watch the trip', body: 'Documents before you go, every flight while you travel, and the rule behind every answer.' },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-[#b4532a]">Elsewhere</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Your group trip, watched. When it goes sideways, the right people know what they’re owed.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-[#4b5745]">
            We read the rules so you don’t have to: refunds, delays, passports, and the fine print — every answer cited.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/start">Start a trip</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/rules">Browse the rules</Link>
            </Button>
          </div>
        </div>
        <Image
          src="/characters/scenes/raccoon-gate.png"
          alt="The raccoon at a departure gate, panicking over a cancelled flight"
          width={1200}
          height={953}
          priority
          className="w-full rounded-2xl"
        />
      </div>
      <ol className="mt-16 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-xl border border-[#e4dfd0] bg-white p-6">
            <span className="text-sm font-semibold text-[#b4532a]">{index + 1}</span>
            <h2 className="mt-2 font-semibold">{step.title}</h2>
            <p className="mt-1 text-sm text-[#4b5745]">{step.body}</p>
          </li>
        ))}
      </ol>
      <section aria-labelledby="cast-heading" className="mt-16">
        <h2 id="cast-heading" className="text-2xl font-bold">Meet the group</h2>
        <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {CHARACTER_NAMES.map((character) => (
            <li key={character} className="flex flex-col items-center text-center">
              <Character character={character} width={160} />
              <p className="mt-2 font-semibold">{CHARACTER_INFO[character].name}</p>
              <p className="text-sm text-[#4b5745]">{CHARACTER_INFO[character].role}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
