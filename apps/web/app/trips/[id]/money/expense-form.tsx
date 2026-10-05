'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { addExpense, type ExpenseState } from './actions';

export function ExpenseForm({ tripId, formKey, members }: { tripId: string; formKey: string; members: { user_id: string; display_name: string }[] }) {
  const [state, action, pending] = useActionState<ExpenseState, FormData>(addExpense.bind(null, tripId), { error: null });
  return (
    <form action={action} className="mt-8 space-y-3 rounded-xl border border-[#e4dfd0] bg-white p-6">
      <h2 className="font-semibold">Add something you paid for</h2>
      <input type="hidden" name="key" value={formKey} />
      <input name="description" placeholder="Airport hotel after the cancellation" maxLength={200} className="w-full rounded-md border border-[#d9d3c2] px-3 py-2" />
      <input name="amount" inputMode="decimal" placeholder="$186.40" className="w-full rounded-md border border-[#d9d3c2] px-3 py-2" />
      <fieldset className="text-sm">
        <legend className="font-medium">Split equally with</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {members.map((m) => (
            <label key={m.user_id} className="flex items-center gap-2">
              <input type="checkbox" name="splitWith" value={m.user_id} defaultChecked /> {m.display_name}
            </label>
          ))}
        </div>
      </fieldset>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Or split by exact amounts</summary>
        <p className="mt-2 text-[#4b5745]">Fill in what each person owes. If you fill any in, they must add up to the total, and the equal split is ignored.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {members.map((m) => (
            <label key={m.user_id} className="flex items-center justify-between gap-2">
              {m.display_name}
              <input name={`share:${m.user_id}`} inputMode="decimal" placeholder="$0.00" className="w-28 rounded-md border border-[#d9d3c2] px-2 py-1" />
            </label>
          ))}
        </div>
      </details>
      {state.error ? <p role="alert" className="text-sm text-[#b42318]">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add expense'}
      </Button>
    </form>
  );
}
