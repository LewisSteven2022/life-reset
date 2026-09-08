import 'server-only';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import type { SelectedArea } from '@/lib/domain/plan';

export type UserAreaRow = SelectedArea & { isActive: boolean };

const COLUMNS = 'id, area_key, name, is_custom, sort_order, is_active';

function toArea(row: {
  id: number; area_key: string | null; name: string; is_custom: boolean; sort_order: number; is_active: boolean;
}): UserAreaRow {
  return {
    userAreaId: row.id,
    areaKey: row.area_key,
    name: row.name,
    isCustom: row.is_custom,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export async function listUserAreas(includeInactive = false): Promise<UserAreaRow[]> {
  await requireUser();
  const supabase = await createServerSupabase();
  let query = supabase.from('user_area').select(COLUMNS).order('sort_order');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(toArea);
}

/** Adds newly ticked catalogue areas and soft-deactivates unticked ones. */
export async function replaceCatalogueSelections(keys: string[]): Promise<void> {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const existing = await listUserAreas(true);

  const toReactivate = existing.filter((a) => a.areaKey && keys.includes(a.areaKey) && !a.isActive);
  const toDeactivate = existing.filter((a) => a.areaKey && !keys.includes(a.areaKey) && a.isActive);
  const existingKeys = new Set(existing.map((a) => a.areaKey).filter(Boolean));
  const toInsert = keys.filter((k) => !existingKeys.has(k));

  if (toInsert.length > 0) {
    const base = existing.length;
    const { error } = await supabase.from('user_area').insert(
      toInsert.map((key, i) => ({
        user_id: user.id, area_key: key, name: key, is_custom: false, sort_order: base + i,
      })),
    );
    if (error) throw error;
  }

  for (const area of toReactivate) {
    const { error } = await supabase.from('user_area').update({ is_active: true }).eq('id', area.userAreaId);
    if (error) throw error;
  }
  for (const area of toDeactivate) {
    const { error } = await supabase.from('user_area').update({ is_active: false }).eq('id', area.userAreaId);
    if (error) throw error;
  }
}

export async function addCustomArea(name: string): Promise<UserAreaRow> {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const existing = await listUserAreas(true);
  const { data, error } = await supabase
    .from('user_area')
    .insert({
      user_id: user.id, area_key: null, name: name.trim(), is_custom: true, sort_order: existing.length,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toArea(data);
}

export async function renameArea(id: number, name: string): Promise<void> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('user_area').update({ name: name.trim() }).eq('id', id);
  if (error) throw error;
}

export async function deactivateArea(id: number): Promise<void> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('user_area').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}
