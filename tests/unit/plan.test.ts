import { describe, it, expect } from 'vitest';
import { generatePlan, customStarterTitle, type SelectedArea, type TemplateInput } from '@/lib/domain/plan';
import { MAX_TOTAL_HABITS } from '@/lib/domain/constants';

function template(key: string, areaKey: string, effort: number, sortOrder: number, isDefault = true): TemplateInput {
  return { key, areaKey, title: `Habit ${key}`, detail: null, effort, sortOrder, isDefault };
}

function area(id: number, areaKey: string | null, name: string, sortOrder: number): SelectedArea {
  return { userAreaId: id, areaKey, name, isCustom: areaKey === null, sortOrder };
}

const TEMPLATES: TemplateInput[] = [
  template('sleep_a', 'sleep', 2, 1),
  template('sleep_b', 'sleep', 1, 2),
  template('sleep_c', 'sleep', 3, 3),
  template('fitness_a', 'fitness', 1, 1),
  template('fitness_b', 'fitness', 2, 2),
  template('money_a', 'money', 1, 1),
  template('money_b', 'money', 2, 2),
  template('focus_a', 'focus', 1, 1),
  template('focus_b', 'focus', 2, 2),
  template('outdoor_a', 'outdoor', 1, 1),
  template('outdoor_b', 'outdoor', 2, 2),
];

describe('generatePlan', () => {
  it('returns nothing when no areas are selected', () => {
    expect(generatePlan([], TEMPLATES)).toEqual([]);
  });

  it('gives two habits per area when three or fewer areas are chosen', () => {
    const plan = generatePlan([area(1, 'sleep', 'Sleep', 1), area(2, 'fitness', 'Fitness', 2)], TEMPLATES);
    expect(plan).toHaveLength(4);
    expect(plan.filter((h) => h.userAreaId === 1)).toHaveLength(2);
    expect(plan.filter((h) => h.userAreaId === 2)).toHaveLength(2);
  });

  it('drops to one habit per area when more than three areas are chosen', () => {
    const areas = [
      area(1, 'sleep', 'Sleep', 1),
      area(2, 'fitness', 'Fitness', 2),
      area(3, 'money', 'Money basics', 3),
      area(4, 'focus', 'Focus', 4),
    ];
    const plan = generatePlan(areas, TEMPLATES);
    expect(plan).toHaveLength(4);
    expect(new Set(plan.map((h) => h.userAreaId)).size).toBe(4);
  });

  it('prefers the lowest-effort template first', () => {
    const plan = generatePlan([area(1, 'sleep', 'Sleep', 1)], TEMPLATES);
    expect(plan[0].sourceTemplateKey).toBe('sleep_b'); // effort 1 beats effort 2
    expect(plan[1].sourceTemplateKey).toBe('sleep_a');
  });

  it('ignores templates that are not marked as defaults', () => {
    const templates = [template('sleep_a', 'sleep', 1, 1, false), template('sleep_b', 'sleep', 2, 2)];
    const plan = generatePlan([area(1, 'sleep', 'Sleep', 1)], templates);
    expect(plan.map((h) => h.sourceTemplateKey)).toEqual(['sleep_b']);
  });

  it('gives every custom area one starter habit', () => {
    const plan = generatePlan([area(9, null, 'Guitar', 1)], TEMPLATES);
    expect(plan).toEqual([
      {
        userAreaId: 9,
        areaLabel: 'Guitar',
        sourceTemplateKey: null,
        title: customStarterTitle('Guitar'),
        detail: 'Swap this for something specific before you start.',
        sortOrder: 0,
      },
    ]);
  });

  it('never leaves a selected area with zero habits', () => {
    const areas = [
      area(1, 'sleep', 'Sleep', 1),
      area(2, 'fitness', 'Fitness', 2),
      area(3, 'money', 'Money basics', 3),
      area(4, 'focus', 'Focus', 4),
      area(5, 'outdoor', 'Outdoor time', 5),
      area(6, null, 'Guitar', 6),
    ];
    const plan = generatePlan(areas, TEMPLATES);
    for (const a of areas) {
      expect(plan.filter((h) => h.userAreaId === a.userAreaId).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('caps the total number of habits', () => {
    const areas = Array.from({ length: 8 }, (_, i) => area(i + 1, null, `Custom ${i + 1}`, i + 1));
    const bigTemplates = [...TEMPLATES];
    const plan = generatePlan(areas, bigTemplates);
    expect(plan.length).toBeLessThanOrEqual(MAX_TOTAL_HABITS);
  });

  it('numbers sortOrder contiguously from zero', () => {
    const plan = generatePlan([area(1, 'sleep', 'Sleep', 1), area(2, 'fitness', 'Fitness', 2)], TEMPLATES);
    expect(plan.map((h) => h.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it('snapshots the area name as the label', () => {
    const plan = generatePlan([area(1, 'sleep', 'Bedtime', 1)], TEMPLATES);
    expect(plan.every((h) => h.areaLabel === 'Bedtime')).toBe(true);
  });

  it('is deterministic', () => {
    const areas = [area(1, 'sleep', 'Sleep', 1), area(2, 'fitness', 'Fitness', 2)];
    expect(generatePlan(areas, TEMPLATES)).toEqual(generatePlan(areas, TEMPLATES));
  });
});
