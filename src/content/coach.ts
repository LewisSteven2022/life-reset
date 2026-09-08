import type { CoachPack } from '@/lib/appearance';

export function coachLineForSetup(pack: CoachPack = 'default'): string {
  if (pack === 'grit') {
    return "Twenty-one days. Small things, done often. Pick where you start and get on with it.";
  }
  if (pack === 'calm') {
    return "Twenty-one days. Small things, done often. We'll pick a quiet place to begin.";
  }
  return "Twenty-one days. Small things, done often. Let's pick where your reset starts.";
}

export function coachLineForDay(
  day: number,
  { completed, scheduled }: { completed: number; scheduled: number },
  pack: CoachPack = 'default',
): string {
  if (pack === 'grit') {
    if (scheduled === 0) return `Day ${day}. Nothing on the list. Rest is still showing up.`;
    if (completed === 0) return `Day ${day}. Nothing ticked yet. Do the easiest one. Then the next.`;
    if (completed >= scheduled) return `Day ${day}. The lot of them. That's a full day — keep that going.`;
    return `Day ${day}. ${completed} of ${scheduled}. Don't stall now.`;
  }
  if (pack === 'calm') {
    if (scheduled === 0) return `Day ${day}. A rest day. Let that be enough.`;
    if (completed === 0) return `Day ${day}. Nothing ticked yet. A gentle start is still a start.`;
    if (completed >= scheduled) return `Day ${day}. All of it, quietly done. Well done.`;
    return `Day ${day}. ${completed} of ${scheduled}. You're in it — no rush.`;
  }
  if (scheduled === 0) return `Day ${day}. Nothing scheduled today — rest counts too.`;
  if (completed === 0) return `Day ${day}. Nothing ticked yet. Pick the easiest one and start there.`;
  if (completed >= scheduled) return `Day ${day}. All of it. That's a full day — well done.`;
  return `Day ${day}. ${completed} of ${scheduled} down. Keep going, you're in it.`;
}

export function coachLineForMiss(pack: CoachPack = 'default'): string {
  if (pack === 'grit') {
    return "Yesterday got away. Fine. Today is still yours — start with one.";
  }
  if (pack === 'calm') {
    return "Yesterday drifted. That happens. Today can be gentle, and still count.";
  }
  return "Yesterday got away from you. That happens — today is a clean page.";
}
