const MAX_FREEZES_PER_MONTH = 2;

/**
 * Pro-rated allotment for the user's first partial month, full afterward.
 * Returns 2 for months the user was present for the full month,
 * pro-rated (ceil) for their signup month, 0 if they hadn't signed up yet.
 */
export function computeAllotment(
  profileCreatedAt: string,
  grantedMonth: string,
): number {
  const monthStart = new Date(grantedMonth + "T00:00:00Z");
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const created = new Date(profileCreatedAt);
  if (created < monthStart) return MAX_FREEZES_PER_MONTH;
  if (created >= monthEnd) return 0;
  // Pro-rated for the partial month: ceil((days_left / days_in_month) * 2), capped at 2.
  const daysInMonth =
    (monthEnd.getTime() - monthStart.getTime()) / 86400000;
  const daysLeft = Math.max(
    0,
    (monthEnd.getTime() - created.getTime()) / 86400000,
  );
  return Math.min(
    MAX_FREEZES_PER_MONTH,
    Math.ceil((daysLeft / daysInMonth) * MAX_FREEZES_PER_MONTH),
  );
}

export type FreezeSource = "allotment" | "credit" | "none";

export function chooseFreezeSource(
  profile: { is_pro: boolean; freeze_credits: number },
  allotmentUsed: number,
  allotment: number,
): FreezeSource {
  if (profile.is_pro && allotmentUsed < allotment) return "allotment";
  if (profile.freeze_credits > 0) return "credit";
  return "none";
}

export function hasRecoverableStreak(
  seals: Array<{ date: string; state: string }>,
  today: string,
): boolean {
  const todayMs = Date.parse(today + "T00:00:00Z");
  for (const s of seals) {
    if (s.state !== "filled" && s.state !== "freeze") continue;
    if (s.date === today) continue;
    const ms = Date.parse(s.date + "T00:00:00Z");
    const ageDays = (todayMs - ms) / 86400000;
    if (ageDays > 0 && ageDays <= 7) return true;
  }
  return false;
}
