import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Character } from '@/components/character';
import { shownOwed } from '@/lib/assist/owed';
import { PlaybookSchema } from '@/lib/assist/playbook-schema';
import { requireUser } from '@/lib/auth/user';
import { findRule } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';
import { createClient } from '@/lib/supabase/server';
import { AnswerButtons } from './answer-buttons';

type Params = Promise<{ id: string; incidentId: string }>;

export default function IncidentPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Suspense fallback={<p className="text-[#4b5745]">Loading…</p>}>
        <IncidentContent params={params} />
      </Suspense>
    </main>
  );
}

/** Links each cited rule by its title. Only a verified rule is shown beside a claim: one being re-checked, or not published, gets no link. */
function Cites({ ids }: { ids: string[] }) {
  const library = getLibrary();
  const rules = ids.flatMap((id) => {
    const rule = findRule(library, id);
    return rule && rule.status === 'verified' ? [rule] : [];
  });
  if (rules.length === 0) return null;
  return (
    <span className="ml-1 text-sm">
      {rules.map((rule) => (
        <Link key={rule.id} href={`/rules/${rule.id}`} className="mr-1 text-[#b4532a] underline">
          [{rule.title}]
        </Link>
      ))}
    </span>
  );
}

async function IncidentContent({ params }: { params: Params }) {
  const { id, incidentId } = await params;
  await requireUser(`/trips/${id}/incidents/${incidentId}`);
  const supabase = await createClient();
  // Everything here is read as the signed-in user. RLS hides a playbook that waits for the founder's review,
  // from the planner too, so until it is released this page has no playbook to show.
  const { data: incident } = await supabase.from('incidents').select('id, status, pending_question, detected_at').eq('id', incidentId).eq('trip_id', id).maybeSingle();
  if (!incident) notFound();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: id });
  const { data: latest } = await supabase.from('playbooks').select('content, rules_cited').eq('incident_id', incidentId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const parsed = latest ? PlaybookSchema.safeParse(latest.content) : null;
  const playbook = parsed?.success ? parsed.data : null;
  const firstCited = playbook ? findRule(getLibrary(), (latest!.rules_cited as { rule_id: string }[])[0]?.rule_id ?? '') : null;
  const firstRule = firstCited?.status === 'verified' ? firstCited : null;
  const library = getLibrary();
  const owed = playbook ? shownOwed(playbook.owed, (id) => findRule(library, id)?.status === 'verified') : [];
  const question = incident.pending_question as { fact: string; prompt: string; options: { value: string; label: string }[] } | null;

  return (
    <>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#b4532a]">What happened</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{playbook?.summary ?? 'We’re working out what applies.'}</h1>
        </div>
        {firstRule ? <Character character={firstRule.lead_character} variant="avatar" width={56} /> : null}
      </div>

      {question && isPlanner === true ? (
        <section className="mt-6 rounded-xl border border-[#e7c37a] bg-[#fdf3dc] p-5">
          <p className="font-medium">{question.prompt}</p>
          <AnswerButtons tripId={id} incidentId={incidentId} fact={question.fact} options={question.options} />
        </section>
      ) : question ? (
        <p className="mt-6 text-[#4b5745]">We asked the planner one question. The full plan follows as soon as they answer.</p>
      ) : null}

      {playbook ? (
        <>
          {owed.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">What you may be entitled to</h2>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                {owed.map((item) => (
                  <li key={item.text}>
                    {item.text}
                    <Cites ids={item.rule_ids} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="mt-8">
            <h2 className="text-xl font-semibold">What to do</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-6">
              {playbook.steps.map((step) => (
                <li key={step.text}>
                  {step.text}
                  <Cites ids={step.rule_ids} />
                </li>
              ))}
            </ol>
          </section>
          {playbook.messages.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">Messages we drafted for you to send</h2>
              {playbook.messages.map((message) => (
                <div key={message.body} className="mt-3 rounded-xl border border-[#e4dfd0] bg-white p-4">
                  <p className="text-sm text-[#4b5745]">
                    To the {message.to} · {message.channel.replace('_', ' ')}
                    <Cites ids={message.rule_ids} />
                  </p>
                  <textarea readOnly defaultValue={message.body} aria-label={`Draft message to the ${message.to}`} className="mt-2 h-32 w-full rounded-md border border-[#d9d3c2] p-2 text-sm" />
                </div>
              ))}
            </section>
          ) : null}
          {playbook.caveats.length > 0 ? (
            <ul className="mt-8 space-y-1 text-sm text-[#4b5745]">
              {playbook.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <p className="mt-10 text-xs text-[#4b5745]">We drafted this from the linked rules. You decide and send. Not legal advice.</p>
    </>
  );
}
