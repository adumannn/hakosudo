"use client";
import Link from "next/link";
import { useState } from "react";
import { Seal } from "@/components/year-scroll/Seal";
import { formatTime } from "@/lib/utils";

interface TodaySeal {
  date: string;
  kanji: string;
  romaji: string;
  meaning: string;
  senseiLine: string | null;
}

interface Props {
  today: TodaySeal | null;
  /** When set, today has been completed and we render the post-solve variant. */
  completedElapsed?: number;
  streakDays: number;
  /** Optional: yesterday missed + freezes-remaining; if both present, show prompt. */
  freezePrompt?: { date: string; kanji: string; remaining: number } | null;
  /** Vertical Japanese day label (e.g. 土曜日) for the left margin. */
  tategakiDay?: string;
}

export function TodayCard({
  today,
  completedElapsed,
  streakDays,
  freezePrompt,
  tategakiDay,
}: Props) {
  const [freezeStatus, setFreezeStatus] = useState<"idle" | "pending" | "done" | "error">("idle");

  if (!today) {
    return (
      <div className="border-t border-b border-sumi py-12 lg:py-16 px-1">
        <div className="eyebrow">today</div>
        <p className="ital text-moss text-[18px] mt-3">
          today's seal isn't ready yet — check back shortly.
        </p>
      </div>
    );
  }

  const stamped = completedElapsed != null;

  const applyFreeze = async () => {
    if (!freezePrompt) return;
    setFreezeStatus("pending");
    const res = await fetch("/api/seal/freeze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: freezePrompt.date }),
    });
    setFreezeStatus(res.ok ? "done" : "error");
  };

  return (
    <div className="border-t border-b border-sumi py-12 lg:py-16 px-1 relative overflow-hidden">
      {/* Decorative oversized faded kanji watermark behind the editorial column */}
      <div
        aria-hidden
        className="watermark-kanji hidden lg:block"
        style={{
          fontSize: "560px",
          right: "-80px",
          top: "-80px",
          color: "hsl(var(--sumi) / 0.035)",
        }}
      >
        {today.kanji}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[28px_minmax(280px,38%)_1fr] gap-6 lg:gap-12 items-center relative">
        {/* Tategaki day label down the left margin (desktop only) */}
        <div className="hidden lg:flex items-start justify-center pt-2 self-start">
          {tategakiDay && (
            <div className="tategaki mincho text-vermillion/85 text-[14px] leading-none">
              {tategakiDay}
            </div>
          )}
        </div>

        <div className="w-full max-w-[400px] aspect-square mx-auto lg:mx-0 hero-seal-impression">
          <Seal
            kanji={today.kanji}
            state={stamped ? "filled" : "today"}
            size="xl"
          />
        </div>

        <div className="relative">
          <div className="eyebrow" style={{ letterSpacing: "0.28em", fontSize: "11px" }}>
            {stamped ? `STAMPED · ${formatTime(completedElapsed!)}` : "today's character"}
          </div>
          <div className="kdate-jp text-[44px] lg:text-[56px] leading-[1.05] mt-3">
            {today.kanji} <span className="text-moss/40">—</span> {today.meaning}
          </div>
          <div className="mono text-[14px] tracking-[0.2em] uppercase text-moss mt-3">
            {today.romaji}
          </div>
          {today.senseiLine && (
            <p className="ital text-sumi text-[20px] lg:text-[22px] mt-5 leading-snug max-w-[44ch]">
              "{today.senseiLine}"
            </p>
          )}
          <div className="mt-7 pt-5 border-t border-sumi/15 flex items-center gap-4 flex-wrap">
            {!stamped && (
              <Link
                href="/play/daily"
                className="bg-sumi text-bone px-7 py-3.5 mono text-[12px] tracking-[0.18em] uppercase hover:bg-sumi/95"
              >
                play today
              </Link>
            )}
            {stamped && (
              <Link
                href={`/api/share/seal/${today.date}`}
                target="_blank"
                rel="noopener"
                className="border border-sumi text-sumi px-7 py-3.5 mono text-[12px] tracking-[0.18em] uppercase hover:bg-sumi/5"
              >
                share
              </Link>
            )}
          </div>
          {freezePrompt && freezeStatus === "idle" && (
            <div className="mt-5 border-t border-sumi/15 pt-4 text-[14px] ital text-sumi max-w-[44ch]">
              yesterday — {freezePrompt.kanji} — missed.{" "}
              <button
                onClick={applyFreeze}
                className="text-vermillion underline underline-offset-4 mono not-italic text-[11px] tracking-[0.14em] uppercase"
              >
                apply freeze
              </button>{" "}
              <span className="text-moss text-[11px]">· {freezePrompt.remaining} left</span>
            </div>
          )}
          {freezeStatus === "pending" && (
            <div className="mt-5 text-[14px] ital text-moss">applying freeze…</div>
          )}
          {freezeStatus === "done" && (
            <div className="mt-5 text-[14px] ital text-vermillion">
              freeze applied · streak kept.
            </div>
          )}
          {freezeStatus === "error" && (
            <div className="mt-5 text-[14px] ital text-hazard">
              could not apply freeze.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
