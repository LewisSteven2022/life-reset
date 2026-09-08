'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { addCustomArea, deactivateArea, renameArea } from '@/lib/data/areas';

export type AreaState = { error: string | null; notice: string | null };

export async function renameAreaAction(_prev: AreaState, formData: FormData): Promise<AreaState> {
  await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  if (name.length === 0 || name.length > 60) return { error: 'Names run 1–60 characters.', notice: null };
  await renameArea(Number(formData.get('areaId')), name);
  revalidatePath('/app/areas');
  return { error: null, notice: 'Renamed.' };
}

export async function deactivateAreaAction(_prev: AreaState, formData: FormData): Promise<AreaState> {
  await requireUser();
  await deactivateArea(Number(formData.get('areaId')));
  revalidatePath('/app/areas');
  return { error: null, notice: 'Hidden. Your finished days for it are still there.' };
}

export async function addAreaAction(_prev: AreaState, formData: FormData): Promise<AreaState> {
  await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  if (name.length === 0 || name.length > 60) return { error: 'Names run 1–60 characters.', notice: null };
  await addCustomArea(name);
  revalidatePath('/app/areas');
  return { error: null, notice: 'Added. Give it a habit over on Plan.' };
}
