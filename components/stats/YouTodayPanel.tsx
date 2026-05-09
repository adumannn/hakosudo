// components/stats/YouTodayPanel.tsx
import { formatTime } from "@/lib/utils";

interface Props {
  streak: number;
  yearFilled: number;
  yearTotal: number;
  /** Seconds. null when today isn't stamped yet. */
  todayElapsed: number | null;
  /** null when today isn't stamped yet. */
  todayRank: { rank: number; total: number } | null;
}

export function YouTodayPanel({
  streak,
  yearFilled,
  yearTotal,
  todayElapsed,
  todayRank,
}: Props) {
  const streakHot = streak >= 7;
  const streakClass =
    "mincho text-[28px] tnum leading-none " +
    (streakHot ? "text-vermillion" : "text-sumi");
  return (
    <aside className="lg:border-l lg:border-sumi/15 lg:pl-10 lg:pt-2">
      <div className="eyebrow red">YOU TODAY</div>
      <dl className="mt-5">
        <Row label="streak" valueClassName={streakClass}>
          {streak === 1 ? "1 day" : `${streak} days`}
        </Row>
        <Row label="year">
          {yearFilled} / {yearTotal}
        </Row>
        <Row label="today">
          {todayElapsed != null ? formatTime(todayElapsed) : "—"}
        </Row>
        <Row label="rank">
          {todayRank != null
            ? `#${todayRank.rank} / ${todayRank.total.toLocaleString()}`
            : "—"}
        </Row>
      </dl>
    </aside>
  );
}

function Row({
  label,
  valueClassName,
  children,
}: {
  label: string;
  valueClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between py-3 border-b border-sumi/12 last:border-b-0">
      <dt className="mono text-[10px] tracking-[0.22em] uppercase text-moss">
        {label}
      </dt>
      <dd
        className={
          valueClassName ?? "mincho text-[28px] tnum leading-none text-sumi"
        }
      >
        {children}
      </dd>
    </div>
  );
}
