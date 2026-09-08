'use client';

import { useOptimistic, useTransition, useState } from 'react';
import { toggleCheckIn } from '@/app/app/actions';
import type { TodayHabit } from '@/lib/data/today';

export function HabitItem({ habit, dayIndex }: { habit: TodayHabit; dayIndex: number }) {
  const [optimisticDone, setOptimisticDone] = useOptimistic(habit.completed);
  const [, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function submit(next: boolean) {
    startTransition(async () => {
      setOptimisticDone(next);
      setFailed(false);
      const formData = new FormData();
      formData.set('habitId', String(habit.id));
      formData.set('dayIndex', String(dayIndex));
      formData.set('completed', String(next));
      try {
        await toggleCheckIn(formData);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <li className={`rounded-2xl border p-4 ${optimisticDone ? 'border-stone-900 bg-white' : 'border-stone-200'}`}>
      <button
        type="button"
        data-habit-checkin
        aria-pressed={optimisticDone}
        onClick={() => submit(!optimisticDone)}
        className="flex w-full items-start gap-3 text-left"
      >
        <span
          aria-hidden
          className={`mt-1 size-5 shrink-0 rounded-full border ${optimisticDone ? 'border-stone-900 bg-stone-900' : 'border-stone-400'}`}
        />
        <span>
          <span className="block text-xs uppercase tracking-wide text-stone-500">{habit.areaLabel}</span>
          <span className={`block text-base ${optimisticDone ? 'text-stone-500 line-through' : ''}`}>
            {habit.title}
          </span>
          {habit.detail ? <span className="block text-sm text-stone-500">{habit.detail}</span> : null}
        </span>
      </button>
      {failed ? (
        <p className="mt-2 text-sm text-red-700">
          That did not save.{' '}
          <button type="button" onClick={() => submit(!habit.completed)} className="underline">
            Try again
          </button>
        </p>
      ) : null}
    </li>
  );
}
