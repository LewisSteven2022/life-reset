'use client';

import { useActionState } from 'react';
import { addHabitAction, renameHabitAction, retireHabitAction, type PlanState } from './actions';
import { Button } from '@/components/ui/button';
import type { ProgrammeHabitRow } from '@/lib/data/programme';
import type { UserAreaRow } from '@/lib/data/areas';

const initial: PlanState = { error: null, notice: null };

export function HabitEditor({
  currentDay, habits, areas,
}: {
  currentDay: number;
  habits: (ProgrammeHabitRow & { activeToday: boolean })[];
  areas: UserAreaRow[];
}) {
  const [renameState, renameAction] = useActionState(renameHabitAction, initial);
  const [retireState, retireAction] = useActionState(retireHabitAction, initial);
  const [addState, addAction, addPending] = useActionState(addHabitAction, initial);
  const notice = renameState.notice ?? retireState.notice ?? addState.notice;
  const error = renameState.error ?? retireState.error ?? addState.error;

  return (
    <div className="space-y-6">
      {notice ? <p className="text-sm text-stone-600">{notice}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ul className="space-y-3">
        {habits.map((habit) => (
          <li key={habit.id} className={`rounded-2xl border p-4 ${habit.activeToday ? 'border-stone-200' : 'border-dashed border-stone-300 opacity-60'}`}>
            <p className="text-xs uppercase tracking-wide text-stone-500">{habit.areaLabel}</p>
            {habit.activeToday ? (
              <>
                <form action={renameAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="habitId" value={habit.id} />
                  <input
                    name="title"
                    defaultValue={habit.title}
                    maxLength={120}
                    className="flex-1 border-b border-stone-200 bg-transparent py-1 outline-none focus:border-stone-900"
                  />
                  <button type="submit" className="text-sm underline">Save</button>
                </form>
                <form action={retireAction} className="mt-3">
                  <input type="hidden" name="habitId" value={habit.id} />
                  <button type="submit" className="text-sm text-stone-500 underline">Drop this one</button>
                </form>
              </>
            ) : (
              <p className="mt-2 text-sm">
                {habit.title} — finished on day {habit.activeToDay ?? currentDay}
              </p>
            )}
          </li>
        ))}
      </ul>

      <form action={addAction} className="space-y-3 border-t border-stone-200 pt-6">
        <h2 className="text-sm uppercase tracking-wide text-stone-500">Add a habit from today</h2>
        <select name="userAreaId" className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3">
          {areas.map((area) => (
            <option key={area.userAreaId} value={area.userAreaId}>{area.name}</option>
          ))}
        </select>
        <input
          name="title"
          maxLength={120}
          placeholder="Something small and specific"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3"
        />
        <Button type="submit" disabled={addPending}>{addPending ? 'Adding…' : 'Add habit'}</Button>
      </form>
    </div>
  );
}
