'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { saveDocuments, type DocumentsState } from './actions';

const inputClass = 'mt-1 w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';

export function DocumentsForm({ tripId, passportCountry, passportExpires }: { tripId: string; passportCountry: string; passportExpires: string }) {
  const [state, formAction, pending] = useActionState<DocumentsState, FormData>(saveDocuments.bind(null, tripId), { error: null, saved: false });
  return (
    <form action={formAction} className="mt-10 space-y-4 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Your documents</h2>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium">
          Passport issued by (two letters)
          <input name="passportCountry" maxLength={2} defaultValue={passportCountry} placeholder="US" className={`${inputClass} uppercase`} />
        </label>
        <label className="block text-sm font-medium">
          Passport expires
          <input name="passportExpires" type="date" defaultValue={passportExpires} className={inputClass} />
        </label>
      </div>
      <fieldset className="text-sm">
        <legend className="font-medium">Is your driver’s license or state ID REAL ID (it has a star)?</legend>
        <div className="mt-2 flex gap-4">
          {['yes', 'no', 'unsure'].map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="realId" value={value} defaultChecked={value === 'unsure'} /> {value === 'unsure' ? 'Not sure' : value[0].toUpperCase() + value.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="keepOnProfile" className="mt-1" /> Keep these for my next trip (otherwise we delete them 30 days after this one).
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1" /> Store my passport’s issuing country and expiry date to check this trip’s entry rules.
      </label>
      {state.error ? <p role="alert" className="text-sm text-[#b42318]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm text-[#2f6b2a]">Saved. We re-checked the trip.</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save and check'}
      </Button>
    </form>
  );
}
