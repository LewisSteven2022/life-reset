import { redirect } from 'next/navigation';
import Link from 'next/link';
import { completeProgrammeIfFinished, getOpenProgramme } from '@/lib/data/programme';
import { getTodayView } from '@/lib/data/today';
import { listUnlocks } from '@/lib/data/rewards';
import { appearanceFromUnlocks } from '@/lib/appearance';
import { StatusRow } from '@/components/status-row';
import { CoachLine } from '@/components/coach-line';
import { HabitItem } from '@/components/habit-item';
import { coachLineForDay, coachLineForMiss } from '@/content/coach';

export default async function TodayPage() {
  const programme = await getOpenProgramme();
  if (!programme || programme.status === 'setup') redirect('/app/setup');

  const view = await getTodayView();
  if (!view) redirect('/app/setup');
  if (view.isComplete) {
    await completeProgrammeIfFinished(programme);
    redirect('/app/complete');
  }

  const appearance = appearanceFromUnlocks(await listUnlocks());
  const missedYesterday = view.progress.lastSettledDay > 0
    && view.progress.lastCountedDay < view.progress.lastSettledDay
    && view.completed === 0;

  return (
    <div className="space-y-6">
      <StatusRow progress={view.progress} levelTitle={view.levelTitle} />

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-quiet">Day {view.currentDay} of 21</p>
        <CoachLine>
          {missedYesterday
            ? coachLineForMiss(appearance.coachPack)
            : coachLineForDay(view.currentDay, view, appearance.coachPack)}
        </CoachLine>
        {view.scheduled > 0 ? (
          <p className="text-sm text-quiet">
            {view.requiredForStreak} of {view.scheduled} keeps your streak alive.
          </p>
        ) : (
          <p className="text-sm text-quiet">Nothing scheduled today. Rest counts too.</p>
        )}
      </header>

      {view.habits.length === 0 ? (
        <p className="rounded-2xl border border-mist px-4 py-6 text-sm text-quiet">
          No habits for this day. You can add one on{' '}
          <Link href="/app/plan" className="underline decoration-mark underline-offset-4">Plan</Link>.
        </p>
      ) : (
        <ul className="space-y-2">
          {view.habits.map((habit) => (
            <HabitItem key={habit.id} habit={habit} dayIndex={view.currentDay} />
          ))}
        </ul>
      )}

      {view.reflectionDue ? (
        <Link
          href="/app/reflect"
          className="block rounded-2xl border border-ink px-5 py-4 text-center text-sm font-medium"
        >
          {view.reflectionDone ? 'Revisit this week’s reflection' : 'Write this week’s reflection'}
        </Link>
      ) : null}
    </div>
  );
}
