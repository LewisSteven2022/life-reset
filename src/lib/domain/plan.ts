import { MAX_HABITS_PER_AREA, MAX_TOTAL_HABITS } from './constants';

export type TemplateInput = {
  key: string;
  areaKey: string;
  title: string;
  detail: string | null;
  effort: number;
  sortOrder: number;
  isDefault: boolean;
};

export type SelectedArea = {
  userAreaId: number;
  areaKey: string | null;
  name: string;
  isCustom: boolean;
  sortOrder: number;
};

export type DraftHabit = {
  userAreaId: number;
  areaLabel: string;
  sourceTemplateKey: string | null;
  title: string;
  detail: string | null;
  sortOrder: number;
};

export function customStarterTitle(areaName: string): string {
  return `Do one small thing for ${areaName}`;
}

const CUSTOM_STARTER_DETAIL = 'Swap this for something specific before you start.';

/**
 * Builds the starting 21-day habit set. Deterministic: same inputs, same output.
 * The user refines this before Day 1, so it errs towards fewer, easier habits.
 */
export function generatePlan(areas: SelectedArea[], templates: TemplateInput[]): DraftHabit[] {
  if (areas.length === 0) return [];

  const ordered = [...areas].sort((a, b) => a.sortOrder - b.sortOrder || a.userAreaId - b.userAreaId);
  const perArea = ordered.length <= 3 ? MAX_HABITS_PER_AREA : 1;

  // Candidate list per area, best-first.
  const candidates = new Map<number, DraftHabit[]>();
  for (const a of ordered) {
    if (a.isCustom || a.areaKey === null) {
      candidates.set(a.userAreaId, [
        {
          userAreaId: a.userAreaId,
          areaLabel: a.name,
          sourceTemplateKey: null,
          title: customStarterTitle(a.name),
          detail: CUSTOM_STARTER_DETAIL,
          sortOrder: 0,
        },
      ]);
      continue;
    }

    const forArea = templates
      .filter((t) => t.isDefault && t.areaKey === a.areaKey)
      .sort((x, y) => x.effort - y.effort || x.sortOrder - y.sortOrder || x.key.localeCompare(y.key))
      .slice(0, perArea)
      .map<DraftHabit>((t) => ({
        userAreaId: a.userAreaId,
        areaLabel: a.name,
        sourceTemplateKey: t.key,
        title: t.title,
        detail: t.detail,
        sortOrder: 0,
      }));

    candidates.set(a.userAreaId, forArea);
  }

  // Round-robin so a total cap trims the second habit of each area before it
  // removes any area's first habit.
  const picked: DraftHabit[] = [];
  for (let round = 0; round < perArea; round += 1) {
    for (const a of ordered) {
      if (picked.length >= MAX_TOTAL_HABITS) break;
      const habit = candidates.get(a.userAreaId)?.[round];
      if (habit) picked.push(habit);
    }
    if (picked.length >= MAX_TOTAL_HABITS) break;
  }

  return picked.map((habit, index) => ({ ...habit, sortOrder: index }));
}
