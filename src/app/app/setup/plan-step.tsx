'use client';

import { useActionState, useState } from 'react';
import { confirmStart, removeDraftHabit, updateDraftHabit, type SetupState } from './actions';
import { Button } from '@/components/ui/button';
import type { ProgrammeHabitRow } from '@/lib/data/programme';

const initial: SetupState = { error: null };

export function PlanStep({ programmeId, habits }: { programmeId: number; habits: ProgrammeHabitRow[] }) {
  const [startState, startAction, startPending] = useActionState(confirmStart, initial);
  const [, updateAction] = useActionState(updateDraftHabit, initial);
  const [, removeAction] = useActionState(removeDraftHabit, initial);
  const [timezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Here is your 21 days</h1>
        <p className="text-stone-600">
          Small on purpose. Change anything that does not fit — after day 1 this gets harder to edit.
        </p>
      </header>

      <ul className="space-y-3">
        {habits.map((habit) => (
          <li key={habit.id} className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-stone-500">{habit.areaLabel}</p>
            <form action={updateAction} className="mt-2 flex gap-2">
              <input type="hidden" name="habitId" value={habit.id} />
              <input
                name="title"
                defaultValue={habit.title}
                maxLength={120}
                className="flex-1 border-b border-stone-200 bg-transparent py-1 text-base outline-none focus:border-stone-900"
              />
              <button type="submit" className="text-sm underline">Save</button>
            </form>
            {habit.detail ? <p className="mt-2 text-sm text-stone-600">{habit.detail}</p> : null}
            <form action={removeAction} className="mt-3">
              <input type="hidden" name="habitId" value={habit.id} />
              <button type="submit" className="text-sm text-stone-500 underline">Remove</button>
            </form>
          </li>
        ))}
      </ul>

      <p className="text-sm text-stone-500">
        Programme {programmeId}. Weekly reflections land on days 7, 14 and 21.
      </p>

      <form action={startAction} className="space-y-3">
        <input type="hidden" name="timezone" value={timezone} />
        {startState.error ? <p className="text-sm text-red-700">{startState.error}</p> : null}
        <Button type="submit" disabled={startPending}>
          {startPending ? 'Starting…' : 'Start day 1 today'}
        </Button>
      </form>
    </div>
  );
}
