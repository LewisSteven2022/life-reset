import Link from 'next/link';
import { redirect } from 'next/navigation';
import { completeProgrammeIfFinished, getOpenProgramme } from '@/lib/data/programme';
import { getCompletionSummary } from '@/lib/data/completion';
import { createServerSupabase } from '@/lib/supabase/server';
import { getOrCreateProgress } from '@/lib/data/progress';

export default async function CompletePage() {
  const open = await getOpenProgramme();
  if (open) await completeProgrammeIfFinished(open);

  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('programme')
    .select('id')
    .eq('status', 'completed')
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) redirect('/app');

  const [summary, progress] = await Promise.all([
    getCompletionSummary(data.id),
    getOrCreateProgress(),
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Twenty-one days</p>
        <h1 className="text-3xl font-semibold">You finished.</h1>
        <p className="text-lg leading-relaxed text-stone-700">
          {summary.daysQualified} of 21 days counted. {summary.totalCheckIns} things ticked off. That is not nothing —
          that is a month of small decisions going the right way.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-wide text-stone-500">What stuck</h2>
        <ul className="space-y-1">
          {summary.bestHabits.map((habit) => (
            <li key={habit.title} className="flex justify-between text-sm">
              <span>{habit.title}</span>
              <span className="text-stone-500">{habit.count} days</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-stone-500">What you wrote</h2>
        {summary.reflections.map((entry) => (
          <article key={entry.dayIndex} className="space-y-1">
            <p className="text-xs text-stone-500">Day {entry.dayIndex}</p>
            <p className="whitespace-pre-wrap text-base">
              {entry.body || <span className="text-stone-400">Left blank.</span>}
            </p>
          </article>
        ))}
      </section>

      <dl className="space-y-2 border-t border-stone-200 pt-6 text-sm">
        <div className="flex justify-between"><dt className="text-stone-500">XP this cycle</dt><dd>{summary.xpEarned}</dd></div>
        <div className="flex justify-between"><dt className="text-stone-500">Longest streak</dt><dd>{progress.streakLongest} days</dd></div>
        <div className="flex justify-between"><dt className="text-stone-500">Points earned</dt><dd>{summary.pointsEarned}</dd></div>
      </dl>

      <Link href="/app/setup" className="block rounded-full bg-stone-900 px-6 py-4 text-center text-stone-50">
        Start another cycle
      </Link>
    </div>
  );
}
