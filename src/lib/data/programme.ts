import 'server-only';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { programmeDayState, type DayState } from '@/lib/domain/day';
import { getQaDayOffset } from '@/lib/qa';
import type { DraftHabit } from '@/lib/domain/plan';
import { getOrCreateProgress } from '@/lib/data/progress';

export type ProgrammeRow = {
  id: number;
  status: 'setup' | 'active' | 'completed' | 'abandoned';
  startDate: string | null;
  timezone: string;
};

export type ProgrammeHabitRow = {
  id: number;
  userAreaId: number | null;
  areaLabel: string;
  title: string;
  detail: string | null;
  activeFromDay: number;
  activeToDay: number | null;
  sortOrder: number;
  sourceTemplateKey: string | null;
};

const PROGRAMME_COLUMNS = 'id, status, start_date, timezone';

function toProgramme(row: {
  id: number; status: string; start_date: string | null; timezone: string;
}): ProgrammeRow {
  return {
    id: row.id,
    status: row.status as ProgrammeRow['status'],
    startDate: row.start_date,
    timezone: row.timezone,
  };
}

export async function getOpenProgramme(): Promise<ProgrammeRow | null> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('programme')
    .select(PROGRAMME_COLUMNS)
    .in('status', ['setup', 'active'])
    .maybeSingle();
  if (error) throw error;
  return data ? toProgramme(data) : null;
}

export async function getOrCreateSetupProgramme(timezone: string): Promise<ProgrammeRow> {
  const existing = await getOpenProgramme();
  if (existing) return existing;

  const user = await requireUser();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('programme')
    .insert({ user_id: user.id, status: 'setup', timezone })
    .select(PROGRAMME_COLUMNS)
    .single();
  if (error) throw error;
  return toProgramme(data);
}

export async function listProgrammeHabits(programmeId: number): Promise<ProgrammeHabitRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('programme_habit')
    .select('id, user_area_id, area_label, title, detail, active_from_day, active_to_day, sort_order, source_template_key')
    .eq('programme_id', programmeId)
    .order('sort_order');
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    userAreaId: r.user_area_id,
    areaLabel: r.area_label,
    title: r.title,
    detail: r.detail,
    activeFromDay: r.active_from_day,
    activeToDay: r.active_to_day,
    sortOrder: r.sort_order,
    sourceTemplateKey: r.source_template_key,
  }));
}

export async function currentDayState(programme: ProgrammeRow): Promise<DayState> {
  if (!programme.startDate) {
    return { localDate: '', rawDayIndex: 0, currentDay: 1, isBeforeStart: true, isComplete: false };
  }
  return programmeDayState({
    startDate: programme.startDate,
    timeZone: programme.timezone,
    now: new Date(),
    dayOffset: await getQaDayOffset(),
  });
}

export async function insertProgrammeHabits(programmeId: number, drafts: DraftHabit[]): Promise<void> {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  if (drafts.length === 0) return;
  const { error } = await supabase.from('programme_habit').insert(
    drafts.map((d) => ({
      user_id: user.id,
      programme_id: programmeId,
      user_area_id: d.userAreaId,
      source_template_key: d.sourceTemplateKey,
      area_label: d.areaLabel,
      title: d.title,
      detail: d.detail,
      active_from_day: 1,
      sort_order: d.sortOrder,
    })),
  );
  if (error) throw error;
}

export async function startProgramme(
  programmeId: number, startDate: string, timezone: string,
): Promise<void> {
  const user = await requireUser();
  await getOrCreateProgress();
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from('programme')
    .update({ status: 'active', start_date: startDate, timezone, started_at: new Date().toISOString() })
    .eq('id', programmeId)
    .eq('status', 'setup');
  if (error) throw error;

  // A new cycle resets streak state but never touches XP or points.
  const progressUpdate = await supabase
    .from('progress')
    .update({
      active_programme_id: programmeId,
      streak_current: 0,
      shield_count: 0,
      last_counted_day: 0,
      last_settled_day: 0,
    })
    .eq('user_id', user.id);
  if (progressUpdate.error) throw progressUpdate.error;
}

/**
 * Removes a habit from `fromDay` onwards while keeping every earlier day's
 * check-ins and scheduled count intact. Setting active_to_day to the day
 * before is how "edits update future days" is implemented.
 */
export async function retireHabit(habitId: number, fromDay: number): Promise<void> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('programme_habit')
    .update({ active_to_day: Math.max(1, fromDay - 1) })
    .eq('id', habitId);
  if (error) throw error;
}

export async function addHabitFromDay(
  programmeId: number, userAreaId: number, areaLabel: string, title: string, fromDay: number,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const existing = await listProgrammeHabits(programmeId);
  const { error } = await supabase.from('programme_habit').insert({
    user_id: user.id,
    programme_id: programmeId,
    user_area_id: userAreaId,
    source_template_key: null,
    area_label: areaLabel,
    title,
    detail: null,
    active_from_day: fromDay,
    sort_order: existing.length,
  });
  if (error) throw error;
}

export async function renameHabit(habitId: number, title: string): Promise<void> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('programme_habit').update({ title }).eq('id', habitId);
  if (error) throw error;
}

/** Flips an active programme to completed once day 21 has passed. */
export async function completeProgrammeIfFinished(programme: ProgrammeRow): Promise<boolean> {
  if (programme.status !== 'active' || !programme.startDate) return false;
  const state = await currentDayState(programme);
  if (!state.isComplete) return false;

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('programme')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', programme.id)
    .eq('status', 'active');
  if (error) throw error;
  return true;
}

export async function abandonProgramme(programmeId: number): Promise<void> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('programme')
    .update({ status: 'abandoned', ended_at: new Date().toISOString() })
    .eq('id', programmeId)
    .in('status', ['setup', 'active']);
  if (error) throw error;
}
