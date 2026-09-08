'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { listAreaCatalogue } from '@/lib/data/catalogue';
import { addCustomArea, listUserAreas, replaceCatalogueSelections } from '@/lib/data/areas';
import {
  getOpenProgramme,
  getOrCreateSetupProgramme,
  insertProgrammeHabits,
  listProgrammeHabits,
  startProgramme,
} from '@/lib/data/programme';
import { generatePlan } from '@/lib/domain/plan';
import { listHabitTemplates } from '@/lib/data/catalogue';
import { localDateInTimeZone } from '@/lib/domain/day';
import { redirect } from 'next/navigation';

export type SetupState = { error: string | null };

export async function saveAreaSelection(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const keys = formData.getAll('areaKey').map(String);
  const timezone = String(formData.get('timezone') || 'Europe/London');

  await getOrCreateSetupProgramme(timezone);
  await replaceCatalogueSelections(keys);

  // Give the freshly inserted rows their human-readable catalogue names.
  const catalogue = new Map((await listAreaCatalogue()).map((a) => [a.key, a.name]));
  const supabase = await createServerSupabase();
  for (const area of await listUserAreas()) {
    const properName = area.areaKey ? catalogue.get(area.areaKey) : null;
    if (properName && area.name !== properName) {
      const { error } = await supabase.from('user_area').update({ name: properName }).eq('id', area.userAreaId);
      if (error) return { error: error.message };
    }
  }

  const active = await listUserAreas();
  if (active.length === 0) return { error: 'Pick at least one area to reset.' };

  revalidatePath('/app/setup');
  redirect('/app/setup?ready=1');
}

export async function addCustomAreaAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  if (name.length === 0 || name.length > 60) {
    return { error: 'Give your area a name between 1 and 60 characters.' };
  }
  const timezone = String(formData.get('timezone') || 'Europe/London');
  await getOrCreateSetupProgramme(timezone);
  await addCustomArea(name);
  revalidatePath('/app/setup');
  return { error: null };
}

export async function generatePlanAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  void _prev;
  void formData;
  await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'setup') return { error: 'No setup in progress.' };

  const existing = await listProgrammeHabits(programme.id);
  if (existing.length > 0) return { error: null };

  const [areas, templates] = await Promise.all([listUserAreas(), listHabitTemplates()]);
  const drafts = generatePlan(areas, templates);
  if (drafts.length === 0) return { error: 'Pick at least one area first.' };

  await insertProgrammeHabits(programme.id, drafts);
  revalidatePath('/app/setup');
  return { error: null };
}

export async function updateDraftHabit(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const id = Number(formData.get('habitId'));
  const title = String(formData.get('title') ?? '').trim();
  if (title.length === 0 || title.length > 120) return { error: 'Habits need a title of 1–120 characters.' };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('programme_habit').update({ title }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/app/setup');
  return { error: null };
}

export async function removeDraftHabit(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'setup') return { error: 'Setup is already finished.' };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('programme_habit')
    .delete()
    .eq('id', Number(formData.get('habitId')))
    .eq('programme_id', programme.id);
  if (error) return { error: error.message };
  revalidatePath('/app/setup');
  return { error: null };
}

export async function addDraftHabit(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const user = await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'setup') return { error: 'Setup is already finished.' };

  const title = String(formData.get('title') ?? '').trim();
  const userAreaId = Number(formData.get('userAreaId'));
  if (title.length === 0 || title.length > 120) return { error: 'Habits need a title of 1–120 characters.' };

  const areas = await listUserAreas();
  const area = areas.find((a) => a.userAreaId === userAreaId);
  if (!area) return { error: 'Pick an area for this habit.' };

  const existing = await listProgrammeHabits(programme.id);
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('programme_habit').insert({
    user_id: user.id,
    programme_id: programme.id,
    user_area_id: area.userAreaId,
    source_template_key: null,
    area_label: area.name,
    title,
    detail: null,
    active_from_day: 1,
    sort_order: existing.length,
  });
  if (error) return { error: error.message };
  revalidatePath('/app/setup');
  return { error: null };
}

export async function confirmStart(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'setup') return { error: 'Setup is already finished.' };

  const habits = await listProgrammeHabits(programme.id);
  if (habits.length === 0) return { error: 'Add at least one habit before you start.' };

  const timezone = String(formData.get('timezone') || programme.timezone);
  const startDate = localDateInTimeZone(new Date(), timezone);
  await startProgramme(programme.id, startDate, timezone);

  revalidatePath('/app', 'layout');
  redirect('/app');
}
