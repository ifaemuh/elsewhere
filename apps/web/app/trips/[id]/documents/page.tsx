import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Character } from '@/components/character';
import { requireUser } from '@/lib/auth/user';
import { renewalAdvice, type RenewalRoute } from '@/lib/documents/deadlines';
import { affiliateOffer, groupStatus, renewalSentenceFor } from '@/lib/documents/present';
import { getLibrary } from '@/lib/rules/library';
import { createClient } from '@/lib/supabase/server';
import { DocumentsForm } from './documents-form';

type Params = Promise<{ id: string }>;

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
  const { data: mine } = await supabase.from('member_documents').select('kind, issuing_country, expires_on, real_id_compliant, keep_on_profile');
  const { data: checks } = await supabase.from('document_checks').select('member_id, user_id, rule_id, result, detail').eq('trip_id', id);
  const { data: routes } = await supabase.from('travel_admin_partner_routes').select('*');
  const { data: directory } = await supabase.rpc('trip_directory', { p_trip_id: id });

  const passport = mine?.find((d) => d.kind === 'passport') ?? null;
  const passportRoute = routes?.find((r) => r.kind === 'passport') as RenewalRoute | undefined;
  const myChecks = (checks ?? []).filter((c) => c.user_id === user.id);
  const rules = getLibrary().rules;

  return (
    <>
      <p className="mt-2 text-[#4b5745]">We keep only your passport’s issuing country and expiry date, and whether you have a REAL ID card, a passport or another ID TSA accepts. Never the number.</p>

      {myChecks.map((check) => {
        const rule = rules.find((r) => r.id === check.rule_id) ?? null;
        if (check.result === 'unknown' && check.rule_id === null) {
          return (
            <section key="no-coverage" className="mt-6 rounded-xl border border-[#e4dfd0] bg-white p-5">
              <p className="font-medium">{check.detail}</p>
              <p className="mt-2 text-sm text-[#4b5745]">Check your destination’s official government site before you go, and make sure your passport is valid for your whole stay.</p>
              {passportRoute ? (
                <p className="mt-2 text-sm">
                  <a href={passportRoute.official_url} className="underline" rel="noopener">
                    {passportRoute.official_label}
                  </a>
                </p>
              ) : null}
            </section>
          );
        }
        if (check.result === 'ok') {
          return (
            <section key="ok" className="mt-6 flex items-center gap-4 rounded-xl border border-[#cfe3c8] bg-[#f1f8ee] p-5">
              <Character character="capybara" variant="avatar" width={48} />
              <p>All clear. Nothing to fix before you go.</p>
            </section>
          );
        }
        const sentence = renewalSentenceFor({ check, rule, passport, trip, route: passportRoute, today: new Date() });
        const advice = check.result === 'action_needed' && passportRoute && rule?.tags.includes('passport') && trip.start_date ? renewalAdvice(trip.start_date, passportRoute, new Date()) : null;
        const affiliate = advice?.kind === 'urgent' && passportRoute ? affiliateOffer(passportRoute) : null;
        return (
          <section key={check.rule_id ?? check.detail} className="mt-6 flex items-start gap-4 rounded-xl border border-[#e7c37a] bg-[#fdf3dc] p-5">
            <Character character="owl" variant="avatar" width={48} />
            <div>
              <p className="font-medium">{sentence ?? check.detail}</p>
              {passportRoute && rule?.tags.includes('passport') ? (
                <p className="mt-2 text-sm">
                  <a href={passportRoute.official_url} className="underline" rel="noopener">
                    {passportRoute.official_label}
                  </a>
                  {passportRoute.official_note ? ` — ${passportRoute.official_note}` : ''}
                </p>
              ) : null}
              {affiliate ? (
                <p className="mt-2 text-sm">
                  <a href={affiliate.url} rel="sponsored noopener" className="underline">
                    {affiliate.label}
                  </a>
                  <span className="block text-xs text-[#4b5745]">{affiliate.disclosure}</span>
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

      <DocumentsForm tripId={id} passportCountry={passport?.issuing_country ?? ''} passportExpires={passport?.expires_on ?? ''} keepOnProfile={mine?.some((d) => d.keep_on_profile) ?? false} />

      {isPlanner === true ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">The group</h2>
          <ul className="mt-3 divide-y divide-[#e4dfd0] rounded-xl border border-[#e4dfd0] bg-white">
            {(directory ?? []).map((member: { member_id: string; display_name: string }) => {
              const status = groupStatus((checks ?? []).filter((c) => c.member_id === member.member_id));
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
