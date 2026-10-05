'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { joinTripAction, type JoinState } from './actions';

const inputClass = 'mt-1 w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';

export function JoinForm({ token, offerSms }: { token: string; offerSms: boolean }) {
  const [state, formAction, pending] = useActionState<JoinState, FormData>(joinTripAction.bind(null, token), { error: null });
  const [timezone, setTimezone] = useState('America/New_York');
  useEffect(() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="timezone" value={timezone} />
      <label className="block text-sm font-medium">
        Your name, as the group knows you
        <input name="displayName" required className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Venmo username (optional, so the group can pay you back)
        <input name="venmo" placeholder="@your-name" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Cash App $cashtag (optional)
        <input name="cashtag" placeholder="$yourname" className={inputClass} />
      </label>
      {offerSms ? (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="smsOptIn" className="mt-1" />
          <span>Text me if something affects my flights. Message and data rates may apply. Reply STOP to opt out.</span>
        </label>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-[#b42318]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Joining…' : 'Join the trip'}
      </Button>
    </form>
  );
}
