'use client';

import { useActionState } from 'react';
import { generatePlanAction, type SetupState } from './actions';
import { Button } from '@/components/ui/button';

const initial: SetupState = { error: null };

export function GeneratePlanForm({ areaCount }: { areaCount: number }) {
  const [state, action, pending] = useActionState(generatePlanAction, initial);

  return (
    <form action={action} className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">Ready when you are</h1>
      <p className="text-quiet">
        {areaCount} {areaCount === 1 ? 'area' : 'areas'} chosen. Let us turn that into 21 days.
      </p>
      {state.error ? <p className="text-sm text-ember">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Building…' : 'Generate my plan'}
      </Button>
    </form>
  );
}
