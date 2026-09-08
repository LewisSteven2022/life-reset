import { redirect } from 'next/navigation';
import { currentDayState, getOpenProgramme } from '@/lib/data/programme';
import { getWeeklyPrompt } from '@/lib/data/catalogue';
import { getReflection, listReflections } from '@/lib/data/reflections';
import { REFLECTION_DAYS } from '@/lib/domain/constants';
import { ReflectionForm } from './reflection-form';

export default async function ReflectPage() {
  const programme = await getOpenProgramme();
  if (!programme || programme.status === 'setup') redirect('/app/setup');

  const dayState = await currentDayState(programme);
  const past = await listReflections(programme.id);
  const dueDay = [...REFLECTION_DAYS].reverse().find((d) => d <= dayState.currentDay) ?? null;

  const current = dueDay ? await getReflection(programme.id, dueDay) : null;
  const prompt = dueDay ? await getWeeklyPrompt(dueDay) : null;
  const nextDay = REFLECTION_DAYS.find((d) => d > dayState.currentDay) ?? null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Reflect</h1>
        {dueDay === null && nextDay !== null ? (
          <p className="text-stone-600">
            Your first reflection lands on day {nextDay}. Nothing to write yet — just keep showing up.
          </p>
        ) : null}
      </header>

      {dueDay !== null && prompt !== null ? (
        <ReflectionForm dayIndex={dueDay} prompt={prompt.prompt} body={current?.body ?? ''} />
      ) : null}

      {past.length > 0 ? (
        <section className="space-y-4 border-t border-stone-200 pt-6">
          <h2 className="text-sm uppercase tracking-wide text-stone-500">Earlier entries</h2>
          {past.map((entry) => (
            <article key={entry.dayIndex} className="space-y-1">
              <p className="text-xs text-stone-500">Day {entry.dayIndex}</p>
              <p className="text-sm text-stone-600">{entry.promptText}</p>
              <p className="whitespace-pre-wrap text-base">
                {entry.body || <span className="text-stone-400">Left blank — that is allowed.</span>}
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
