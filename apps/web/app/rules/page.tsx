import Link from 'next/link';
import type { Metadata } from 'next';
import { Character } from '@/components/character';
import { getLibrary } from '@/lib/rules/library';
import { DOMAIN_LABELS, DOMAIN_ORDER, publishedRules } from '@/lib/rules/accessors';

export const metadata: Metadata = {
  title: 'Travel rules, explained · Elsewhere',
  description: 'Refunds, delays, passports, and the fine print — every rule quoted from its source.',
};

export default function RulesIndexPage() {
  const rules = publishedRules(getLibrary());
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-4xl font-bold tracking-tight">Travel rules, explained</h1>
      <p className="mt-3 text-lg text-[#4b5745]">Every rule here quotes its source word for word.</p>
      {DOMAIN_ORDER.map((domain) => {
        const inDomain = rules.filter((rule) => rule.domain === domain);
        if (inDomain.length === 0) return null;
        return (
          <section key={domain} className="mt-10">
            <h2 className="text-xl font-semibold">{DOMAIN_LABELS[domain]}</h2>
            <ul className="mt-4 grid gap-3">
              {inDomain.map((rule) => (
                <li key={rule.id}>
                  <Link href={`/rules/${rule.id}`} className="flex items-center gap-4 rounded-xl border border-[#e4dfd0] bg-white p-4 hover:border-[#b4532a]">
                    <Character character={rule.lead_character} variant="avatar" width={44} />
                    <span className="font-medium">{rule.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
