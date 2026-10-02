import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Character } from '@/components/character';
import { requireUser } from '@/lib/auth/user';
import { requiredMonths } from '@/lib/documents/check';
import { passportSentence, renewalAdvice, type RenewalRoute } from '@/lib/documents/deadlines';
import { getLibrary } from '@/lib/rules/library';
import { createClient } from '@/lib/supabase/server';
import { DocumentsForm } from './documents-form';

type Params = Promise<{ id: string }>;
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });

export default function DocumentsPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Travel documents</h1>
      <Suspense fallback={<p className="mt-6 text-[#4b5745]">Loading…</p>}>
        <DocumentsContent params={params} />
      </Suspense>
    </main>
  );
}

async function DocumentsContent({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser(`/trips/${id}/documents`);
  const supabase = await createClient();
  const { data: trip } = await supabase.from('trips').select('id, name, destination_country, start_date, end_date').eq('id', id).maybeSingle();
  if (!trip) notFound();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: id });
  const { data: mine } = await supabase.from('member_documents').select('kind, issuing_country, expires_on, real_id_compliant');
  const { data: checks } = await supabase.from('document_checks').select('member_id, user_id, rule_id, result, detail').eq('trip_id', id);
  const { data: routes } = await supabase.from('travel_admin_partner_routes').select('*');
  const { data: directory } = await supabase.rpc('trip_directory', { p_trip_id: id });

  const passport = mine?.find((d) => d.kind === 'passport') ?? null;
  const passportRoute = routes?.find((r) => r.kind === 'passport') as RenewalRoute | undefined;
  const myChecks = (checks ?? []).filter((c) => c.user_id === user.id);
  const rules = getLibrary().rules;

  return (
    <>
      <p className="mt-2 text-[#4b5745]">We keep only your passport’s issuing country and expiry date, and whether your ID is REAL ID. Never the number.</p>

      {myChecks.map((check) => {
        const rule = rules.find((r) => r.id === check.rule_id) ?? null;
        if (check.result === 'ok') {
          return (
            <section key="ok" className="mt-6 flex items-center gap-4 rounded-xl border border-[#cfe3c8] bg-[#f1f8ee] p-5">
              <Character character="capybara" variant="avatar" width={48} />
              <p>All clear. Nothing to fix before you go.</p>
            </section>
          );
        }
        const months = rule ? requiredMonths(rule) : null;
        const advice = passportRoute && rule?.tags.includes('passport') && trip.start_date ? renewalAdvice(trip.start_date, passportRoute, new Date()) : null;
        const sentence =
          rule && months && passport?.expires_on && trip.end_date && advice && trip.destination_country
            ? passportSentence({ expiresOn: passport.expires_on, tripEnd: trip.end_date, requiredMonths: months, countryName: regionName.of(trip.destination_country) ?? trip.destination_country, advice })
            : check.detail;
        return (
          <section key={check.rule_id ?? check.detail} className="mt-6 flex items-start gap-4 rounded-xl border border-[#e7c37a] bg-[#fdf3dc] p-5">
            <Character character="owl" variant="avatar" width={48} />
            <div>
              <p className="font-medium">{sentence}</p>
              {passportRoute && rule?.tags.includes('passport') ? (
                <p className="mt-2 text-sm">
                  <a href={passportRoute.official_url} className="underline" rel="noopener">
                    {passportRoute.official_label}
                  </a>
                  {passportRoute.official_note ? ` — ${passportRoute.official_note}` : ''}
                </p>
              ) : null}
              {advice?.kind === 'urgent' && passportRoute?.affiliate_url ? (
                <p className="mt-2 text-sm">
                  <a href={passportRoute.affiliate_url} rel="sponsored noopener" className="underline">
                    {passportRoute.affiliate_label}
                  </a>
                  <span className="block text-xs text-[#4b5745]">{passportRoute.affiliate_disclosure}</span>
                </p>
              ) : null}
              {rule ? (
                <a href={`/rules/${rule.id}`} className="mt-2 inline-block text-sm text-[#b4532a] underline">
                  The rule, with its source
                </a>
              ) : null}
            </div>
          </section>
        );
      })}

      <DocumentsForm tripId={id} passportCountry={passport?.issuing_country ?? ''} passportExpires={passport?.expires_on ?? ''} />

      {isPlanner === true ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">The group</h2>
          <ul className="mt-3 divide-y divide-[#e4dfd0] rounded-xl border border-[#e4dfd0] bg-white">
            {(directory ?? []).map((member: { member_id: string; display_name: string }) => {
              const theirs = (checks ?? []).filter((c) => c.member_id === member.member_id);
              const status = theirs.some((c) => c.result === 'action_needed') ? 'Needs attention' : theirs.some((c) => c.result === 'unknown') ? 'Hasn’t confirmed yet' : 'All clear';
              return (
                <li key={member.member_id} className="flex justify-between px-4 py-3">
                  <span>{member.display_name}</span>
                  <span className="text-sm text-[#4b5745]">{status}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
