'use client';

import { useActionState } from 'react';
import { redeemReward, type RewardState } from './actions';
import type { RewardWithOwnership } from '@/lib/data/rewards';

const initial: RewardState = { error: null, unlockedKey: null };

export function RewardList({ rewards }: { rewards: RewardWithOwnership[] }) {
  const [state, action, pending] = useActionState(redeemReward, initial);

  return (
    <div className="space-y-3">
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <ul className="space-y-2">
        {rewards.map((reward) => (
          <li key={reward.key} className="flex items-start justify-between gap-4 rounded-2xl border border-stone-200 p-4">
            <div>
              <p className="font-medium">{reward.name}</p>
              <p className="text-sm text-stone-600">{reward.description}</p>
            </div>
            {reward.owned ? (
              <span className="shrink-0 text-sm text-stone-500">Yours</span>
            ) : (
              <form action={action} className="shrink-0">
                <input type="hidden" name="rewardKey" value={reward.key} />
                <button
                  type="submit"
                  disabled={pending || !reward.affordable}
                  className="rounded-full border border-stone-900 px-4 py-2 text-sm disabled:opacity-40"
                >
                  {reward.costPoints} pts
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
