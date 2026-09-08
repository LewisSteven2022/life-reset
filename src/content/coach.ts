export function coachLineForSetup(): string {
  return "Twenty-one days. Small things, done often. Let's pick where your reset starts.";
}

export function coachLineForDay(
  day: number,
  { completed, scheduled }: { completed: number; scheduled: number },
): string {
  if (scheduled === 0) return `Day ${day}. Nothing scheduled today — rest counts too.`;
  if (completed === 0) return `Day ${day}. Nothing ticked yet. Pick the easiest one and start there.`;
  if (completed >= scheduled) return `Day ${day}. All of it. That's a full day — well done.`;
  return `Day ${day}. ${completed} of ${scheduled} down. Keep going, you're in it.`;
}

export function coachLineForMiss(): string {
  return "Yesterday got away from you. That happens — today is a clean page.";
}
