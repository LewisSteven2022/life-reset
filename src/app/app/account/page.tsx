import { requireUser } from '@/lib/auth';
import { getOrCreateProgress } from '@/lib/data/progress';
import { getOpenProgramme } from '@/lib/data/programme';
import { listUnlocks } from '@/lib/data/rewards';
import { levelForXp } from '@/lib/domain/levels';
import { AbandonButton } from './abandon-button';
import Link from 'next/link';

export default async function AccountPage() {
  const [user, progress, programme, unlocks] = await Promise.all([
    requireUser(), getOrCreateProgress(), getOpenProgramme(), listUnlocks(),
  ]);
  const level = levelForXp(progress.xpTotal);
  const ownsFinisher = unlocks.some((u) => u.rewardKey === 'badge_finisher');

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-semibold">Account</h1>
        <p className="text-quiet">{user.email}</p>
      </header>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-quiet">Level</dt><dd>{level.level} — {level.title}</dd></div>
        <div className="flex justify-between"><dt className="text-quiet">XP</dt><dd>{progress.xpTotal}</dd></div>
        <div className="flex justify-between"><dt className="text-quiet">Longest streak</dt><dd>{progress.streakLongest} days</dd></div>
        <div className="flex justify-between"><dt className="text-quiet">Reset points</dt><dd>{progress.pointsBalance}</dd></div>
        {ownsFinisher ? (
          <div className="flex justify-between"><dt className="text-quiet">Badge</dt><dd>21-day finisher</dd></div>
        ) : null}
      </dl>

      {programme?.status === 'active' ? (
        <p className="text-sm text-quiet">Cycle in progress. Areas live on the <Link href="/app/areas" className="underline decoration-mark underline-offset-4">Areas</Link> screen.</p>
      ) : null}

      {programme ? <AbandonButton /> : null}

      <form action="/auth/sign-out" method="post">
        <button type="submit" className="text-sm underline decoration-mark underline-offset-4">Sign out</button>
      </form>
    </div>
  );
}
