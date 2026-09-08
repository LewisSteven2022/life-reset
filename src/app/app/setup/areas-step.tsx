'use client';

import { useActionState, useState } from 'react';
import { saveAreaSelection, addCustomAreaAction, type SetupState } from './actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { AreaCatalogueRow } from '@/lib/data/catalogue';
import type { UserAreaRow } from '@/lib/data/areas';

const initial: SetupState = { error: null };

export function AreasStep({
  catalogue, selected, customAreas,
}: {
  catalogue: AreaCatalogueRow[];
  selected: string[];
  customAreas: UserAreaRow[];
}) {
  const [saveState, saveAction, savePending] = useActionState(saveAreaSelection, initial);
  const [customState, customAction] = useActionState(addCustomAreaAction, initial);
  const [picked, setPicked] = useState<string[]>(selected);
  const [timezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London',
  );

  const total = picked.length + customAreas.length;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Where does your reset start?</h1>
        <p className="text-stone-600">
          Three to five areas works best. You can always change your mind before day 1.
        </p>
      </header>

      <form action={saveAction} className="space-y-6">
        <input type="hidden" name="timezone" value={timezone} />
        <ul className="space-y-2">
          {catalogue.map((area) => {
            const isPicked = picked.includes(area.key);
            return (
              <li key={area.key}>
                <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${isPicked ? 'border-stone-900 bg-white' : 'border-stone-200'}`}>
                  <input
                    type="checkbox"
                    name="areaKey"
                    value={area.key}
                    checked={isPicked}
                    aria-label={area.name}
                    onChange={(e) =>
                      setPicked((prev) => (e.target.checked ? [...prev, area.key] : prev.filter((k) => k !== area.key)))
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium">{area.name}</span>
                    <span className="block text-sm text-stone-600">{area.description}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <p className="text-sm text-stone-500">
          {total} selected{total > 5 ? ' — that is a lot to hold at once, but it is your call.' : ''}
        </p>
        {saveState.error ? <p className="text-sm text-red-700">{saveState.error}</p> : null}
        <Button type="submit" disabled={savePending || total === 0}>
          {savePending ? 'Saving…' : 'Build my plan'}
        </Button>
      </form>

      <form action={customAction} className="space-y-3 border-t border-stone-200 pt-6">
        <input type="hidden" name="timezone" value={timezone} />
        <Field label="Something not on the list?" name="name" maxLength={60} placeholder="e.g. Guitar practice" />
        {customState.error ? <p className="text-sm text-red-700">{customState.error}</p> : null}
        <button type="submit" className="text-sm underline">Add your own area</button>
      </form>

      {customAreas.length > 0 ? (
        <ul className="space-y-1 text-sm text-stone-600">
          {customAreas.map((area) => <li key={area.userAreaId}>Your area: {area.name}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
