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
}

export function TodayCard({ today, completedElapsed, streakDays, freezePrompt }: Props) {
  const [freezeStatus, setFreezeStatus] = useState<"idle" | "pending" | "done" | "error">("idle");

  if (!today) {
    return (
      <div className="border-t border-b border-sumi py-7 px-1">
        <div className="eyebrow">today</div>
        <p className="ital text-moss text-[16px] mt-3">
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
    <div className="border-t border-b border-sumi py-7 px-1">
      <div className="grid grid-cols-[96px_1fr] gap-5 items-center">
        <div className="w-[96px] h-[96px]">
          <Seal
            kanji={today.kanji}
            state={stamped ? "filled" : "today"}
            size="lg"
          />
        </div>
        <div>
          <div className="eyebrow">
            {stamped ? `STAMPED · ${formatTime(completedElapsed!)}` : "today's character"}
          </div>
          <div className="kdate-jp text-[22px] mt-1">
            {today.kanji} — {today.meaning} · {today.romaji}
          </div>
          {today.senseiLine && (
            <p className="ital text-sumi text-[14px] mt-2 leading-snug">
              "{today.senseiLine}"
            </p>
          )}
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            {!stamped && (
              <Link
                href="/play/daily"
                className="bg-sumi text-bone px-4 py-2 mono text-[11px] tracking-[0.16em] uppercase hover:bg-sumi/95"
              >
                play today
              </Link>
            )}
            {stamped && (
              <Link
                href={`/api/share/seal/${today.date}`}
                target="_blank"
                rel="noopener"
                className="border border-sumi text-sumi px-4 py-2 mono text-[11px] tracking-[0.16em] uppercase hover:bg-sumi/5"
              >
                share
              </Link>
            )}
            {streakDays > 0 && (
              <span className="mono text-[11px] tracking-[0.14em] uppercase text-vermillion">
                streak · {streakDays}d
              </span>
            )}
          </div>
          {freezePrompt && freezeStatus === "idle" && (
            <div className="mt-4 border-t border-sumi/15 pt-3 text-[13px] ital text-sumi">
              yesterday's seal — {freezePrompt.kanji} — was missed.{" "}
              <button
                onClick={applyFreeze}
                className="text-vermillion underline underline-offset-4 mono not-italic text-[11px] tracking-[0.14em] uppercase"
              >
                apply freeze
              </button>{" "}
              <span className="text-moss text-[11px]">({freezePrompt.remaining} of 2 left)</span>
            </div>
          )}
          {freezeStatus === "pending" && (
            <div className="mt-4 text-[13px] ital text-moss">applying freeze…</div>
          )}
          {freezeStatus === "done" && (
            <div className="mt-4 text-[13px] ital text-vermillion">
              freeze applied · streak kept.
            </div>
          )}
          {freezeStatus === "error" && (
            <div className="mt-4 text-[13px] ital text-hazard">
              could not apply freeze.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
