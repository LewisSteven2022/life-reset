import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import type { TemplateInput } from '@/lib/domain/plan';

export type AreaCatalogueRow = { key: string; name: string; description: string; sortOrder: number };
export type RewardRow = {
  key: string; name: string; description: string; costPoints: number;
  rewardType: 'coach_note_pack' | 'theme' | 'badge';
};

export async function listAreaCatalogue(): Promise<AreaCatalogueRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('area_catalogue')
    .select('key, name, description, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data.map((r) => ({ key: r.key, name: r.name, description: r.description, sortOrder: r.sort_order }));
}

export async function listHabitTemplates(): Promise<TemplateInput[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('habit_template')
    .select('key, area_key, title, detail, effort, sort_order, is_default');
  if (error) throw error;
  return data.map((r) => ({
    key: r.key,
    areaKey: r.area_key,
    title: r.title,
    detail: r.detail,
    effort: r.effort,
    sortOrder: r.sort_order,
    isDefault: r.is_default,
  }));
}

export async function getWeeklyPrompt(dayIndex: number): Promise<{ key: string; prompt: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('weekly_prompt')
    .select('key, prompt')
    .eq('day_index', dayIndex)
    .order('sort_order')
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

export async function listRewards(): Promise<RewardRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('reward_catalogue')
    .select('key, name, description, cost_points, reward_type')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data.map((r) => ({
    key: r.key, name: r.name, description: r.description,
    costPoints: r.cost_points, rewardType: r.reward_type as RewardRow['rewardType'],
  }));
}
