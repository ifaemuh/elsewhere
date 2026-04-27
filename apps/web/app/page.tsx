import Link from 'next/link';
import { fetchDestinations, totalCost, type DestinationRow } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Sparkles, Wallet, ShieldCheck, MapPin } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function safeFetchDestinations(): Promise<DestinationRow[]> {
  try {
    return await fetchDestinations();
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const destinations = await safeFetchDestinations();

  return (
    <main className="bg-black text-white">
      <Hero />
      <Pillars />
      <Destinations destinations={destinations} />
      <FinalCTA />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/20 via-purple-900/10 to-black"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.03] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:64px_64px]"
      />
      <div className="mx-auto max-w-6xl px-6 pt-12 pb-24 sm:pt-20 sm:pb-32">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="inline-block size-2 rounded-full bg-amber-400" />
            Elsewhere
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm text-white/70 hover:text-white">
              Sign in
            </Link>
            <Button asChild size="sm" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <Link href="/preview">Try a preview</Link>
            </Button>
          </div>
        </nav>

        <div className="mt-20 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <Sparkles className="size-3.5 text-amber-400" />
            AI vacation previews — see yourself there before you book
          </div>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-7xl">
            See your next trip
            <br />
            <span className="bg-gradient-to-r from-amber-300 via-pink-200 to-amber-300 bg-clip-text text-transparent">
              before you take it.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Personalized AI previews put you in the scene. One tap turns the preview into a real,
            bookable trip — with split payments, financing, and live travel assist if anything
            goes sideways.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-white text-black hover:bg-white/90">
              <Link href="/preview">
                Generate a preview <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="#destinations">Explore destinations</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pillars() {
  const items = [
    {
      icon: Sparkles,
      title: 'Personal previews',
      body: 'Generate cinematic AI scenes of yourself at the destination. Share the reel, then book the trip.',
    },
    {
      icon: ShieldCheck,
      title: 'Travel profile',
      body: 'Passport, TSA PreCheck, Global Entry — kept current and ready before you book.',
    },
    {
      icon: Wallet,
      title: 'One-click + split pay',
      body: 'Lock the trip in seconds. Split costs across travelers, with 0% financing through partners.',
    },
    {
      icon: MapPin,
      title: 'Live assist',
      body: 'Delays, cancellations, hotel issues — Elsewhere watches and resolves them automatically.',
    },
  ];
  return (
    <section className="border-b border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          A travel app built for the moment you say <em className="font-serif italic">"let's go."</em>
        </h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <Card key={item.title} className="border-white/10 bg-white/[0.03] text-white">
              <CardContent className="p-6">
                <item.icon className="size-5 text-amber-300" />
                <div className="mt-6 text-base font-semibold">{item.title}</div>
                <div className="mt-2 text-sm text-white/60">{item.body}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Destinations({ destinations }: { destinations: DestinationRow[] }) {
  return (
    <section id="destinations" className="border-b border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-amber-300">
              Featured
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Three places, ready to preview.
            </h2>
          </div>
          <div className="hidden text-sm text-white/50 sm:block">
            Pick one. We'll generate a personal preview from a single selfie.
          </div>
        </div>

        {destinations.length === 0 ? (
          <div className="mt-12 rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/60">
            <p>Backend not reachable yet.</p>
            <p className="mt-2 text-sm">
              Make sure <code className="rounded bg-white/10 px-1.5 py-0.5">apps/api</code> is
              running on port 3002.
            </p>
          </div>
        ) : (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((d) => (
              <DestinationCard key={d.id} destination={d} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DestinationCard({ destination }: { destination: DestinationRow }) {
  const total = totalCost(destination);
  return (
    <Card className="group overflow-hidden border-white/10 bg-white/[0.03] text-white transition hover:border-white/20 hover:bg-white/[0.06]">
      <div className="relative aspect-[4/5] overflow-hidden">
        {destination.preview_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={destination.preview_image_url}
            alt={destination.name}
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,200,100,0.25),transparent_60%),radial-gradient(circle_at_70%_70%,rgba(180,80,200,0.25),transparent_60%)]"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-5">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <MapPin className="size-3" />
            {destination.country}
          </div>
          <div className="mt-1 text-xl font-semibold tracking-tight">{destination.name}</div>
        </div>
      </div>
      <CardContent className="p-5">
        <p className="line-clamp-2 text-sm text-white/70">{destination.teaser}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm">
            <span className="text-white/50">From </span>
            <span className="font-semibold">${total.toLocaleString()}</span>
            <span className="text-white/50"> / traveler</span>
          </div>
          <Button asChild size="sm" className="bg-white text-black hover:bg-white/90">
            <Link href={`/preview?destination=${destination.id}`}>Preview</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FinalCTA() {
  return (
    <section className="bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Stop scrolling. Start packing.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/60">
          Generate a free preview in under a minute. Book only if it feels right.
        </p>
        <div className="mt-8">
          <Button asChild size="lg" className="bg-white text-black hover:bg-white/90">
            <Link href="/preview">
              Try it free <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-xs text-white/50">
        <div>© {new Date().getFullYear()} Elsewhere. All rights reserved.</div>
        <div className="flex items-center gap-2">
          <span className="inline-block size-1.5 rounded-full bg-emerald-400" />
          Status: dev
        </div>
      </div>
    </footer>
  );
}
