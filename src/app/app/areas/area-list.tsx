'use client';

import { useActionState } from 'react';
import { addAreaAction, deactivateAreaAction, renameAreaAction, type AreaState } from './actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { UserAreaRow } from '@/lib/data/areas';

const initial: AreaState = { error: null, notice: null };

export function AreaList({ areas }: { areas: UserAreaRow[] }) {
  const [renameState, renameAction] = useActionState(renameAreaAction, initial);
  const [hideState, hideAction] = useActionState(deactivateAreaAction, initial);
  const [addState, addAction, addPending] = useActionState(addAreaAction, initial);
  const notice = renameState.notice ?? hideState.notice ?? addState.notice;
  const error = renameState.error ?? hideState.error ?? addState.error;

  return (
    <div className="space-y-6">
      {notice ? <p className="text-sm text-stone-600">{notice}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ul className="space-y-3">
        {areas.map((area) => (
          <li key={area.userAreaId} className="rounded-2xl border border-stone-200 p-4">
            <form action={renameAction} className="flex gap-2">
              <input type="hidden" name="areaId" value={area.userAreaId} />
              <input
                name="name"
                defaultValue={area.name}
                maxLength={60}
                className="flex-1 border-b border-stone-200 bg-transparent py-1 outline-none focus:border-stone-900"
              />
              <button type="submit" className="text-sm underline">Save</button>
            </form>
            <form action={hideAction} className="mt-3">
              <input type="hidden" name="areaId" value={area.userAreaId} />
              <button type="submit" className="text-sm text-stone-500 underline">Hide this area</button>
            </form>
          </li>
        ))}
      </ul>

      <form action={addAction} className="space-y-3 border-t border-stone-200 pt-6">
        <Field label="Add another area" name="name" maxLength={60} placeholder="e.g. Guitar practice" />
        <Button type="submit" disabled={addPending}>{addPending ? 'Adding…' : 'Add area'}</Button>
      </form>
    </div>
  );
}
