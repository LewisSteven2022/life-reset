import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

export type ReflectionRow = {
  dayIndex: number; promptKey: string | null; promptText: string; body: string; updatedAt: string;
};

const COLUMNS = 'day_index, prompt_key, prompt_text, body, updated_at';

function toReflection(row: {
  day_index: number; prompt_key: string | null; prompt_text: string; body: string; updated_at: string;
}): ReflectionRow {
  return {
    dayIndex: row.day_index,
    promptKey: row.prompt_key,
    promptText: row.prompt_text,
    body: row.body,
    updatedAt: row.updated_at,
  };
}

export async function listReflections(programmeId: number): Promise<ReflectionRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('reflection')
    .select(COLUMNS)
    .eq('programme_id', programmeId)
    .order('day_index');
  if (error) throw error;
  return data.map(toReflection);
}

export async function getReflection(programmeId: number, dayIndex: number): Promise<ReflectionRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('reflection')
    .select(COLUMNS)
    .eq('programme_id', programmeId)
    .eq('day_index', dayIndex)
    .maybeSingle();
  if (error) throw error;
  return data ? toReflection(data) : null;
}
