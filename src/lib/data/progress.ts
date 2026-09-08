import 'server-only';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';

export type ProgressRow = {
  xpTotal: number;
  level: number;
  pointsEarnedTotal: number;
  pointsBalance: number;
  streakCurrent: number;
  streakLongest: number;
  shieldCount: number;
  lastCountedDay: number;
  lastSettledDay: number;
  activeProgrammeId: number | null;
};

const COLUMNS =
  'xp_total, level, points_earned_total, points_balance, streak_current, streak_longest, shield_count, last_counted_day, last_settled_day, active_programme_id';

export function toProgress(row: {
  xp_total: number;
  level: number;
  points_earned_total: number;
  points_balance: number;
  streak_current: number;
  streak_longest: number;
  shield_count: number;
  last_counted_day: number;
  last_settled_day: number;
  active_programme_id: number | null;
}): ProgressRow {
  return {
    xpTotal: Number(row.xp_total),
    level: Number(row.level),
    pointsEarnedTotal: Number(row.points_earned_total),
    pointsBalance: Number(row.points_balance),
    streakCurrent: Number(row.streak_current),
    streakLongest: Number(row.streak_longest),
    shieldCount: Number(row.shield_count),
    lastCountedDay: Number(row.last_counted_day),
    lastSettledDay: Number(row.last_settled_day),
    activeProgrammeId: row.active_programme_id === null ? null : Number(row.active_programme_id),
  };
}

export async function getOrCreateProgress(): Promise<ProgressRow> {
  const user = await requireUser();
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.from('progress').select(COLUMNS).maybeSingle();
  if (error) throw error;
  if (data) return toProgress(data);

  const inserted = await supabase
    .from('progress')
    .insert({ user_id: user.id })
    .select(COLUMNS)
    .single();
  if (inserted.error) throw inserted.error;
  return toProgress(inserted.data);
}
