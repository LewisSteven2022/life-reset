'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { currentDayState, getOpenProgramme, addHabitFromDay, renameHabit, retireHabit } from '@/lib/data/programme';
import { listUserAreas } from '@/lib/data/areas';

export type PlanState = { error: string | null; notice: string | null };

export async function retireHabitAction(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'active') return { error: 'No active programme.', notice: null };

  const { currentDay } = await currentDayState(programme);
  await retireHabit(Number(formData.get('habitId')), currentDay);

  revalidatePath('/app/plan');
  revalidatePath('/app');
  return {
    error: null,
    notice: 'Dropped from tomorrow onwards. Everything you already ticked still counts.',
  };
}

export async function renameHabitAction(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requireUser();
  const title = String(formData.get('title') ?? '').trim();
  if (title.length === 0 || title.length > 120) {
    return { error: 'Habits need a title of 1–120 characters.', notice: null };
  }
  await renameHabit(Number(formData.get('habitId')), title);
  revalidatePath('/app/plan');
  revalidatePath('/app');
  return { error: null, notice: 'Updated.' };
}

export async function addHabitAction(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'active') return { error: 'No active programme.', notice: null };

  const title = String(formData.get('title') ?? '').trim();
  const userAreaId = Number(formData.get('userAreaId'));
  if (title.length === 0 || title.length > 120) {
    return { error: 'Habits need a title of 1–120 characters.', notice: null };
  }

  const area = (await listUserAreas()).find((a) => a.userAreaId === userAreaId);
  if (!area) return { error: 'Pick an area for this habit.', notice: null };

  const { currentDay } = await currentDayState(programme);
  await addHabitFromDay(programme.id, area.userAreaId, area.name, title, currentDay);

  revalidatePath('/app/plan');
  revalidatePath('/app');
  return { error: null, notice: `Added from day ${currentDay}.` };
}
