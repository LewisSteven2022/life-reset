import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentDayState, getOpenProgramme, listProgrammeHabits } from '@/lib/data/programme';
import { listUserAreas } from '@/lib/data/areas';
import { isScheduledOnDay } from '@/lib/domain/schedule';
import { PROGRAMME_DAYS, REFLECTION_DAYS } from '@/lib/domain/constants';
import { HabitEditor } from './habit-editor';

export default async function PlanPage() {
  const programme = await getOpenProgramme();
  if (!programme || programme.status === 'setup') redirect('/app/setup');

  const [habits, areas, dayState] = await Promise.all([
    listProgrammeHabits(programme.id),
    listUserAreas(),
    currentDayState(programme),
  ]);

  const days = Array.from({ length: PROGRAMME_DAYS }, (_, i) => i + 1);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Your 21 days</h1>
        <p className="text-quiet">
          Day {dayState.currentDay}. Edits here take effect from today onwards.{' '}
          <Link href="/app/areas" className="underline decoration-mark underline-offset-4">Manage areas</Link>
        </p>
      </header>

      <ol className="grid grid-cols-7 gap-1" aria-label="Programme days">
        {days.map((day) => (
          <li
            key={day}
            className={`aspect-square rounded-lg text-center text-[11px] leading-8 ${
              day < dayState.currentDay
                ? 'bg-stone-200 text-stone-600'
                : day === dayState.currentDay
                  ? 'bg-stone-900 text-stone-50'
                  : 'bg-stone-100 text-stone-400'
            }`}
          >
            {(REFLECTION_DAYS as readonly number[]).includes(day) ? `${day}★` : day}
          </li>
        ))}
      </ol>

      <HabitEditor
        currentDay={dayState.currentDay}
        habits={habits.map((h) => ({ ...h, activeToday: isScheduledOnDay(h, dayState.currentDay) }))}
        areas={areas}
      />
    </div>
  );
}
