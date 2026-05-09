"use client";
import { useEffect, useRef, useState } from "react";
import { Seal } from "@/components/year-scroll/Seal";
import { SealPopover } from "@/components/year-scroll/SealPopover";
import type { SealEntry, YearSeries } from "@/lib/seal/types";

interface Props {
  series: YearSeries;
  /** Cell pixel size. Default 28 for the home page; /year page passes ~40. */
  cellPx?: number;
  gapPx?: number;
  /** Seal size enum mapped to the cell box. Default "sm" for 28px, "md" for 40px. */
  sealSize?: "xs" | "sm" | "md";
  /** Show weekday rail on the left (M T W ...). Off by default — too noisy at 28px. */
  showWeekdayRail?: boolean;
}

const MONTH_ABBR = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const WEEKDAY_RAIL = ["月", "", "水", "", "金", "", "日"];

export function YearScroll({
  series,
  cellPx = 28,
  gapPx = 4,
  sealSize = "sm",
  showWeekdayRail = false,
}: Props) {
  const todayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<SealEntry | null>(null);

  useEffect(() => {
    const todayEl = todayRef.current;
    const container = scrollRef.current;
    if (!todayEl || !container) return;
    const target = todayEl.offsetLeft - container.clientWidth / 2 + todayEl.clientWidth / 2;
    container.scrollLeft = Math.max(0, target);
  }, []);

  const onSealClick = (e: SealEntry) => {
    if (e.state === "filled" || e.state === "freeze") setPopover(e);
  };

  // Bucket seals into weeks aligned to ISO Mon-start. Pad week 0 if year doesn't start Monday.
  const cellsByWeek: (SealEntry | null)[][] = [];
  if (series.seals.length > 0) {
    const first = new Date(series.seals[0].date + "T00:00:00Z");
    const dow = (first.getUTCDay() + 6) % 7;
    let week: (SealEntry | null)[] = Array(dow).fill(null);
    for (const e of series.seals) {
      week.push(e);
      if (week.length === 7) {
        cellsByWeek.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      cellsByWeek.push(week);
    }
  }

  // Detect month boundaries: first non-null entry of each month → column.
  const monthMarkers: { weekIndex: number; abbr: string }[] = [];
  let lastMonth = -1;
  cellsByWeek.forEach((week, wi) => {
    for (const entry of week) {
      if (!entry) continue;
      const month = parseInt(entry.date.slice(5, 7), 10) - 1;
      if (month !== lastMonth) {
        monthMarkers.push({ weekIndex: wi, abbr: MONTH_ABBR[month] });
        lastMonth = month;
      }
      break;
    }
  });

  const railColPx = showWeekdayRail ? 18 : 0;

  return (
    <div ref={scrollRef} className="overflow-x-auto pb-3 scroll-smooth">
      <div
        className="grid items-start"
        style={{
          gridTemplateColumns: showWeekdayRail
            ? `${railColPx}px repeat(${cellsByWeek.length}, ${cellPx}px)`
            : `repeat(${cellsByWeek.length}, ${cellPx}px)`,
          gridTemplateRows: `auto repeat(7, ${cellPx}px)`,
          gap: `${gapPx}px`,
          rowGap: `${Math.max(2, Math.floor(gapPx * 0.6))}px`,
        }}
      >
        {monthMarkers.map((m) => (
          <div
            key={`m-${m.weekIndex}`}
            className="mono text-[10px] tracking-[0.22em] text-moss uppercase pb-2 whitespace-nowrap"
            style={{ gridColumn: m.weekIndex + 1 + (showWeekdayRail ? 1 : 0), gridRow: 1 }}
          >
            {m.abbr}
          </div>
        ))}

        {showWeekdayRail &&
          WEEKDAY_RAIL.map((label, di) => (
            <div
              key={`r-${di}`}
              className="mincho text-[10px] text-moss/70 self-center text-center sticky left-0 z-10"
              style={{
                gridColumn: 1,
                gridRow: di + 2,
                background: "hsl(var(--bone))",
              }}
            >
              {label}
            </div>
          ))}

        {cellsByWeek.map((week, wi) =>
          week.map((entry, di) => {
            if (!entry) return null;
            const isToday = entry.state === "today";
            return (
              <div
                key={entry.date}
                ref={isToday ? todayRef : undefined}
                className={isToday ? "brush-today" : undefined}
                style={{
                  gridColumn: wi + 1 + (showWeekdayRail ? 1 : 0),
                  gridRow: di + 2,
                }}
              >
                <Seal
                  kanji={entry.sealKanji}
                  state={entry.state}
                  size={sealSize}
                  onClick={
                    entry.state === "filled" || entry.state === "freeze"
                      ? () => onSealClick(entry)
                      : undefined
                  }
                  ariaLabel={`${entry.date} · ${entry.kanji}`}
                />
              </div>
            );
          }),
        )}
      </div>
      <SealPopover entry={popover} open={!!popover} onOpenChange={(o) => !o && setPopover(null)} />
    </div>
  );
}
