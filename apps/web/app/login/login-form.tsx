'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { loginAction, type LoginState } from './actions';

const inputClass = 'w-full rounded-md border border-[#d9d3c2] bg-white px-3 py-2';

export function LoginForm({ next, initialEmail, initialStep }: { next: string; initialEmail: string; initialStep: 'email' | 'verify' }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    step: initialStep,
    email: initialEmail,
    error: null,
  });
  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      {state.step === 'email' ? (
        <>
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={inputClass} />
          <input type="hidden" name="intent" value="send" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Sending…' : 'Email me a code'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-[#4b5745]">We sent a code to {state.email}.</p>
          <input type="hidden" name="email" value={state.email} />
          <label htmlFor="code" className="block text-sm font-medium">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className={`${inputClass} tracking-widest`} />
          <input type="hidden" name="intent" value="verify" />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Checking…' : 'Sign in'}
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
