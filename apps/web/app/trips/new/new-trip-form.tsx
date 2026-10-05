'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { createTrip, type NewTripState } from './actions';

const inputClass = 'mt-1 w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';
const COMMON_COUNTRIES = ['US', 'MX', 'CA', 'GB', 'FR', 'ES', 'PT', 'IT', 'GR', 'DE', 'NL', 'IE', 'IS', 'JP', 'CO', 'CR', 'DO', 'JM'];

export function NewTripForm() {
  const [state, formAction, pending] = useActionState<NewTripState, FormData>(createTrip, { error: null });
  return (
    <form action={formAction} className="mt-8 space-y-5">
      <label className="block text-sm font-medium">
        Trip name
        <input name="name" required placeholder="Lisbon 2026" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Destination country (two-letter code)
        <input name="destinationCountry" required maxLength={2} list="countries" placeholder="PT" className={`${inputClass} uppercase`} />
        <datalist id="countries">
          {COMMON_COUNTRIES.map((code) => (
            <option key={code} value={code} />
          ))}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium">
          Leaving
          <input name="startDate" type="date" required className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Back
          <input name="endDate" type="date" required className={inputClass} />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Your name, as the group knows you
        <input name="displayName" required className={inputClass} />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-[#b42318]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create the trip'}
      </Button>
    </form>
  );
}
