import type { ProgressRow } from '@/lib/data/progress';

export function StatusRow({ progress, levelTitle }: { progress: ProgressRow; levelTitle: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-stone-200 pb-3 text-sm text-stone-600">
      <span title={levelTitle}>Lv {progress.level}</span>
      <span>{progress.xpTotal} XP</span>
      <span>
        {progress.streakCurrent}-day streak{progress.shieldCount > 0 ? ' · shielded' : ''}
      </span>
      <span>{progress.pointsBalance} pts</span>
    </div>
  );
}
