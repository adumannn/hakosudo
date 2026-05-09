export interface HeatDay {
  date: string;
  level: 0 | 1 | 2 | 3;
}

export function computeUserHeatmap(input: {
  today: string;
  results: { date: string; elapsed_seconds: number }[];
  freezes: Set<string>;
  mediansByDate: Map<string, number>;
}): HeatDay[] {
  const { today, results, freezes, mediansByDate } = input;
  const completionByDate = new Map<string, number>();
  for (const r of results) completionByDate.set(r.date, r.elapsed_seconds);

  const out: HeatDay[] = [];
  const todayDate = new Date(today + "T00:00:00Z");
  for (let i = 181; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const elapsed = completionByDate.get(date);
    let level: HeatDay["level"] = 0;
    if (elapsed !== undefined) {
      const median = mediansByDate.get(date);
      level = median !== undefined && elapsed < median ? 3 : 2;
    } else if (freezes.has(date)) {
      level = 1;
    }
    out.push({ date, level });
  }
  return out;
}
