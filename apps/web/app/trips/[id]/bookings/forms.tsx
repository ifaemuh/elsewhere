'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { addManualFlight, correctFlight, uploadScreenshot, type FormState } from './actions';

const inputClass = 'mt-1 w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';

export function ScreenshotForm({ tripId }: { tripId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadScreenshot.bind(null, tripId), { error: null, done: false });
  return (
    <form action={action} className="mt-10 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Add a booking from a screenshot</h2>
      <input type="file" name="screenshot" accept="image/png,image/jpeg,image/webp" required className="mt-3 block text-sm" />
      {state.error ? <p role="alert" className="mt-2 text-sm text-[#b42318]">{state.error}</p> : null}
      {state.done ? <p role="status" className="mt-2 text-sm text-[#2f6b2a]">Got it. It shows up here in a minute.</p> : null}
      <Button type="submit" disabled={pending} className="mt-3">
        {pending ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  );
}

export function ManualFlightForm({
  tripId,
  members,
  meId,
}: {
  tripId: string;
  members: { member_id: string; display_name: string }[];
  meId: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addManualFlight.bind(null, tripId), { error: null, done: false });
  return (
    <form action={action} className="mt-6 grid gap-3 rounded-xl border border-[#e4dfd0] bg-white p-6 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">Add a flight by hand</h2>
      <label className="text-sm font-medium">Flight<input name="flight" placeholder="TP 204" required className={inputClass} /></label>
      <label className="text-sm font-medium">Confirmation code (optional)<input name="code" className={`${inputClass} uppercase`} /></label>
      <label className="text-sm font-medium">Date<input name="date" type="date" required className={inputClass} /></label>
      <label className="text-sm font-medium">Local departure time<input name="time" type="time" required className={inputClass} /></label>
      <label className="text-sm font-medium">From<input name="from" maxLength={3} placeholder="EWR" required className={`${inputClass} uppercase`} /></label>
      <label className="text-sm font-medium">To<input name="to" maxLength={3} placeholder="LIS" required className={`${inputClass} uppercase`} /></label>
      <fieldset className="text-sm sm:col-span-2">
        <legend className="font-medium">Who’s on this flight?</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {members.map((member) => (
            <label key={member.member_id} className="flex items-center gap-2">
              <input type="checkbox" name="travelers" value={member.member_id} defaultChecked={member.member_id === meId} /> {member.display_name}
            </label>
          ))}
        </div>
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-[#b42318] sm:col-span-2">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="sm:col-span-2">
        {pending ? 'Adding…' : 'Add flight'}
      </Button>
    </form>
  );
}

export function CorrectFlightForm({
  tripId,
  segmentId,
  defaults,
}: {
  tripId: string;
  segmentId: string;
  defaults: { flight: string; date: string; time: string; from: string; to: string };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(correctFlight.bind(null, tripId, segmentId), { error: null, done: false });
  return (
    <form action={action} className="mt-2 grid gap-2 rounded-md border border-[#e4dfd0] p-3 sm:grid-cols-3">
      <p className="text-sm font-medium sm:col-span-3">We couldn’t find this flight. Check the number and date.</p>
      <label className="text-xs font-medium">Flight<input name="flight" defaultValue={defaults.flight} required className={inputClass} /></label>
      <label className="text-xs font-medium">Date<input name="date" type="date" defaultValue={defaults.date} required className={inputClass} /></label>
      <label className="text-xs font-medium">Local departure time<input name="time" type="time" defaultValue={defaults.time} required className={inputClass} /></label>
      <label className="text-xs font-medium">From<input name="from" maxLength={3} defaultValue={defaults.from} required className={`${inputClass} uppercase`} /></label>
      <label className="text-xs font-medium">To<input name="to" maxLength={3} defaultValue={defaults.to} required className={`${inputClass} uppercase`} /></label>
      <Button type="submit" size="sm" disabled={pending} className="self-end">
        {pending ? 'Checking…' : 'Save and check again'}
      </Button>
      {state.error ? <p role="alert" className="text-sm text-[#b42318] sm:col-span-3">{state.error}</p> : null}
    </form>
  );
}
