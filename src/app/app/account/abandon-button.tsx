'use client';

import { useActionState } from 'react';
import { abandonProgrammeAction, type AccountState } from './actions';

const initial: AccountState = { error: null };

export function AbandonButton() {
  const [state, action, pending] = useActionState(abandonProgrammeAction, initial);

  return (
    <form action={action} className="space-y-3 border-t border-stone-200 pt-6">
      <h2 className="text-sm uppercase tracking-wide text-stone-500">Start over</h2>
      <p className="text-sm text-stone-600">
        Stopping this cycle keeps everything you have written and every point of XP. The streak goes back to zero.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" value="yes" />
        Yes, end this cycle
      </label>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-sm text-red-700 underline disabled:opacity-50">
        {pending ? 'Ending…' : 'End this cycle and start fresh'}
      </button>
    </form>
  );
}
