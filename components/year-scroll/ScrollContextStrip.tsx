"use client";
import { motion } from "framer-motion";
import { Seal } from "@/components/year-scroll/Seal";
import type { SealEntry } from "@/lib/seal/types";

interface Props {
  /** 9 entries: [today-4 ... today ... today+4]. Today is at index 4. */
  window: SealEntry[];
  /** Number of filled days year-to-date for the label. */
  filledCount: number;
  totalDays: number;
}

export function ScrollContextStrip({ window, filledCount, totalDays }: Props) {
  return (
    <div className="border-t border-dashed border-sumi/20 mt-2 pt-3 px-6 pb-4">
      <div className="eyebrow text-center mb-2">
        your year · {filledCount} / {totalDays}
      </div>
      <div className="flex gap-1 justify-center">
        {window.map((entry, i) => {
          const isToday = i === 4;
          return (
            <motion.div
              key={entry.date}
              initial={isToday ? { scale: 0.4, opacity: 0 } : false}
              animate={isToday ? { scale: 1, opacity: 1 } : undefined}
              transition={isToday ? { duration: 0.5, ease: "easeOut" } : undefined}
              className="w-7 h-7"
            >
              <Seal kanji={entry.sealKanji} state={entry.state} size="sm" />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
