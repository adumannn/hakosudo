"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGame } from "@/lib/store/game-store";
import { formatTime, cn } from "@/lib/utils";
import { ScrollContextStrip } from "@/components/year-scroll/ScrollContextStrip";
import { useSkin } from "@/components/theme/SkinContext";
import { playSfx } from "@/lib/sfx";
import { SealStamp } from "@/lib/vfx/SealStamp";
import type { SealEntry, YearSeries } from "@/lib/seal/types";

interface WinModalProps {
  signedIn?: boolean;
  dailyKanji?: { kanji: string; romaji: string; meaning: string } | null;
}

export function WinModal({ signedIn = false, dailyKanji = null }: WinModalProps) {
  const isComplete = useGame((s) => s.isComplete);
  const elapsed = useGame((s) => s.elapsed);
  const errorsMade = useGame((s) => s.errorsMade);
  const hintsUsed = useGame((s) => s.hintsUsed);
  const difficulty = useGame((s) => s.difficulty);
  const dailyDate = useGame((s) => s.dailyDate);
  const dailyNumber = useGame((s) => s.dailyNumber);
  const board = useGame((s) => s.board);
  const skin = useSkin();

  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [consent, setConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<YearSeries | null>(null);

  useEffect(() => {
    if (!isComplete) {
      setOpen(false);
      setShowDetails(false);
      return;
    }

    const openTimer = window.setTimeout(() => setOpen(true), 400);
    const thunkTimer = window.setTimeout(() => playSfx("solve-thunk"), 400);
    const toneTimer = window.setTimeout(() => playSfx("solve-tone"), 600);
    const detailsTimer = window.setTimeout(() => setShowDetails(true), 1200);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(thunkTimer);
      window.clearTimeout(toneTimer);
      window.clearTimeout(detailsTimer);
    };
  }, [isComplete]);

  const fetchYear = async () => {
    try {
      const r = await fetch("/api/seal/year");
      if (!r.ok) return;
      const j = (await r.json()) as YearSeries;
      setSeries(j);
    } catch {}
  };

  const submitImpl = async (consentValue: boolean) => {
    if (!dailyDate) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/daily/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dailyDate,
          finalState: board.map((v) => v.toString()).join(""),
          elapsed,
          consentCity: consentValue,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        await fetchYear();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Submission failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-submit the moment the modal opens for a daily; otherwise just fetch the year for the strip.
  // Anonymous viewers skip both — there's no account to record against and the
  // year-scroll API rejects unauthenticated reads.
  useEffect(() => {
    if (!open) return;
    if (!signedIn) return;
    if (dailyDate && !submitted && !submitting) {
      void submitImpl(consent);
    } else if (!dailyDate) {
      // casual play — no submit, no series
      return;
    } else {
      void fetchYear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dailyDate, signedIn]);

  const onConsentChange = (next: boolean) => {
    setConsent(next);
    if (submitted && dailyDate) void submitImpl(next);
  };

  const contextWindow: SealEntry[] | null = (() => {
    if (!series || !dailyDate) return null;
    const i = series.seals.findIndex((s) => s.date === dailyDate);
    if (i < 0) return null;
    const out: SealEntry[] = [];
    for (let j = -4; j <= 4; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < series.seals.length) {
        const e = series.seals[idx];
        // Optimistically force today to "filled" so the seal stamps even
        // before the submit round-trip finishes.
        if (e.date === dailyDate && e.state === "today") {
          out.push({ ...e, state: "filled", elapsedSeconds: elapsed });
        } else {
          out.push(e);
        }
      }
    }
    return out.length === 9 ? out : null;
  })();

  const baseFilled = series?.seals.filter((s) => s.state === "filled" || s.state === "freeze").length ?? 0;
  const todayAlreadyFilled = !!series?.seals.find((s) => s.date === dailyDate && s.state === "filled");
  const filledCount = baseFilled + (dailyDate && !todayAlreadyFilled ? 1 : 0);
  const totalDays = series?.seals.length ?? 365;
  const todayKanji = skin.sealKanji;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 max-w-[480px] bg-bone border-2 border-sumi rounded-none">
        <div className="px-8 py-10 text-center relative">
          <div className="relative w-[88px] h-[88px] mx-auto">
            <SealStamp
              kanji={todayKanji}
              className="w-[88px] h-[88px] text-[48px] absolute inset-0"
            />
            <span
              className={cn(
                "solve-check absolute bottom-1 right-1 w-[22px] h-[22px] bg-vermillion text-bone rounded-full flex items-center justify-center text-[12px] font-semibold pointer-events-none",
                showDetails && "solve-check-visible",
              )}
              aria-hidden
            >
              ✓
            </span>
          </div>
          <DialogTitle asChild>
            <h2 className="h-disp text-[56px] mt-6 leading-[0.96]">
              Solved.
            </h2>
          </DialogTitle>
          <p className="ital text-moss text-[18px] mt-3">
            {dailyDate
              ? `Daily${dailyNumber != null ? ` № ${dailyNumber.toString().padStart(4, "0")}` : ""} · ${dailyDate}`
              : `${difficulty ?? "casual"} box closed.`}
          </p>

          {dailyDate && dailyKanji && (
            <div className="mt-5">
              <div className="eyebrow">earned today</div>
              <div className="kdate-jp text-[48px] leading-none mt-2">{dailyKanji.kanji}</div>
              <div className="ital text-moss text-[14px] mt-2">
                {dailyKanji.romaji} · {dailyKanji.meaning}
              </div>
            </div>
          )}

          <div className={cn("solve-details", showDetails && "solve-details-visible")}>
            <div className="grid grid-cols-3 gap-2 py-6 mt-4 border-t border-b border-sumi">
              <Stat label="time" value={formatTime(elapsed)} />
              <Stat label="errors" value={errorsMade} />
              <Stat label="hints" value={hintsUsed} />
            </div>

            {contextWindow && dailyDate && (
              <div className="mt-4 -mx-8">
                <ScrollContextStrip
                  window={contextWindow}
                  filledCount={filledCount}
                  totalDays={totalDays}
                />
              </div>
            )}

            {dailyDate && signedIn && (
              <div className="space-y-3 mt-4 text-left">
                <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => onConsentChange(e.target.checked)}
                    className="h-4 w-4 accent-vermillion"
                  />
                  <span>Share my city on the ledger</span>
                </label>
                {submitting && !submitted && (
                  <div className="text-moss text-[12px] mono uppercase tracking-wider">
                    recording…
                  </div>
                )}
                {submitted && (
                  <div className="text-[13px] text-moss ital">
                    recorded ·{" "}
                    <Link href="/leaderboard" className="underline text-vermillion not-italic">
                      view ledger
                    </Link>
                  </div>
                )}
                {error && (
                  <div className="text-hazard text-[13px] mono uppercase tracking-wider">
                    {error}
                    <button
                      onClick={() => submitImpl(consent)}
                      className="ml-2 underline"
                      disabled={submitting}
                    >
                      retry
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {!signedIn && (
            <p className="ital text-moss text-[13px] mt-5 leading-snug">
              — without an account, this won&rsquo;t be saved.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-3">
            {!signedIn ? (
              <>
                {dailyDate ? (
                  <a
                    href={`/api/share/seal/${dailyDate}`}
                    target="_blank"
                    rel="noopener"
                    className="btn-hako ghost justify-center font-mincho text-[14px] py-3"
                  >
                    share
                  </a>
                ) : (
                  <Link
                    href={difficulty ? `/play/${difficulty}` : "/"}
                    className="btn-hako ghost justify-center font-mincho text-[14px] py-3"
                  >
                    play another
                  </Link>
                )}
                <Link
                  href={`/auth/signup?next=${encodeURIComponent(
                    dailyDate ? "/" : `/play/${difficulty ?? "hard"}`,
                  )}`}
                  className="btn-hako red justify-center font-mincho text-[14px] py-3"
                >
                  sign in to keep this →
                </Link>
              </>
            ) : (
              <>
                {dailyDate ? (
                  <a
                    href={`/api/share/seal/${dailyDate}`}
                    target="_blank"
                    rel="noopener"
                    className="btn-hako ghost justify-center font-mincho text-[14px] py-3"
                  >
                    share
                  </a>
                ) : (
                  <Link href="/" className="btn-hako ghost justify-center font-mincho text-[14px] py-3">
                    home
                  </Link>
                )}
                {dailyDate ? (
                  <Link
                    href="/"
                    className="btn-hako red justify-center font-mincho text-[14px] py-3"
                  >
                    tomorrow →
                  </Link>
                ) : (
                  difficulty && (
                    <Link
                      href={`/play/${difficulty}`}
                      className="btn-hako red justify-center font-mincho text-[14px] py-3"
                    >
                      play another
                    </Link>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="kdate-jp text-[28px] font-semibold mt-1 tnum">
        {value}
      </div>
    </div>
  );
}
