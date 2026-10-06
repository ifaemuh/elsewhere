import Image from 'next/image';
import Link from 'next/link';
import { Character } from '@/components/character';
import { Button } from '@/components/ui/button';
import { CHARACTER_INFO, CHARACTER_NAMES } from '@/lib/characters';
import { findRule } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';
import { HANDLE, INSTAGRAM_URL } from '@/components/follow-card';

const START_HERE = ['us-dot-refund-cancelled-flight', 'us-dot-bag-fee-refund-delayed-bag', 'us-dot-bumping-compensation'];

export default function HomePage() {
  const library = getLibrary();
  const startHere = START_HERE.map((id) => findRule(library, id)).filter((rule) => rule !== null);
  return (
    <main className="mx-auto max-w-5xl px-6 pb-16 pt-10">
      <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            What you’re owed when travel goes sideways.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-[#4b5745]">
            Cancelled flights, lost bags, bumped seats, surprise fees, passports and permits. Every rule in plain English, with the official source linked.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/rules">Browse the rules</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={INSTAGRAM_URL}>Follow {HANDLE}</a>
            </Button>
          </div>
        </div>
        <Image
          src="/characters/scenes/raccoon-gate.jpg"
          alt="The raccoon at a departure gate, panicking over a cancelled flight"
          width={1856}
          height={1664}
          sizes="(min-width: 768px) 45vw, 100vw"
          priority
          className="w-full rounded-2xl"
        />
      </div>
      {startHere.length > 0 ? (
        <section aria-labelledby="start-heading" className="mt-16">
          <h2 id="start-heading" className="text-2xl font-bold">Start here</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {startHere.map((rule) => (
              <li key={rule.id}>
                <Link href={`/rules/${rule.id}`} className="flex h-full items-center gap-4 rounded-xl border border-[#e4dfd0] bg-white p-4 hover:border-[#b4532a]">
                  <Character character={rule.lead_character} variant="avatar" width={44} />
                  <span className="font-medium">{rule.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
