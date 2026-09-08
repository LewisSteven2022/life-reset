import { listRewardsWithOwnership } from '@/lib/data/rewards';
import { RewardList } from './reward-list';

export default async function RewardsPage() {
  const { rewards, pointsBalance } = await listRewardsWithOwnership();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Rewards</h1>
        <p className="text-stone-600">
          {pointsBalance} reset points. These are for the look and feel — they never change the programme.
        </p>
      </header>
      <RewardList rewards={rewards} />
    </div>
  );
}
