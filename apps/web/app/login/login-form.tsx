'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loginAction, type LoginState } from './actions';

const inputClass = 'w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';

export function LoginForm({
  next,
  initialContact,
  initialStep,
  phoneAvailable,
}: {
  next: string;
  initialContact: string;
  initialStep: 'contact' | 'verify';
  phoneAvailable: boolean;
}) {
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    step: initialStep,
    channel: 'email',
    contact: initialContact,
    error: null,
  });
  const activeChannel = state.step === 'verify' ? state.channel : channel;
  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="channel" value={activeChannel} />
      {state.step === 'contact' ? (
        <>
          {phoneAvailable ? (
            <div className="flex gap-2 text-sm" role="radiogroup" aria-label="How should we send your code?">
              <Button type="button" variant={channel === 'email' ? 'default' : 'outline'} size="sm" onClick={() => setChannel('email')}>
                Email
              </Button>
              <Button type="button" variant={channel === 'phone' ? 'default' : 'outline'} size="sm" onClick={() => setChannel('phone')}>
                Text message
              </Button>
            </div>
          ) : null}
          <label htmlFor="contact" className="block text-sm font-medium">
            {channel === 'phone' ? 'Mobile number' : 'Email'}
          </label>
          <input
            id="contact"
            name="contact"
            type={channel === 'phone' ? 'tel' : 'email'}
            autoComplete={channel === 'phone' ? 'tel' : 'email'}
            required
            defaultValue={state.contact}
            className={inputClass}
          />
          <input type="hidden" name="intent" value="send" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Sending…' : 'Send me a code'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-[#4b5745]">We sent a code to {state.contact}.</p>
          <input type="hidden" name="contact" value={state.contact} />
          <label htmlFor="code" className="block text-sm font-medium">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className={`${inputClass} tracking-widest`} />
          <input type="hidden" name="intent" value="verify" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Checking…' : 'Continue'}
          </Button>
        </>
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-[#b42318]">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
