"use client";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTime } from "@/lib/utils";
import type { SealEntry } from "@/lib/seal/types";

interface Props {
  entry: SealEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SealPopover({ entry, open, onOpenChange }: Props) {
  if (!entry) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bone border-2 border-sumi rounded-none p-0 max-w-[360px]">
        <div className="px-7 py-7 text-center">
          <div className="eyebrow text-moss">{entry.date}</div>
          <DialogTitle asChild>
            <h2 className="mincho text-[64px] leading-none mt-3 text-sumi">
              {entry.kanji}
            </h2>
          </DialogTitle>
          <div className="mono text-[11px] tracking-[0.16em] text-moss mt-3 uppercase">
            {entry.romaji} · {entry.meaning}
          </div>
          <div className="border-t border-sumi/15 mt-5 pt-5">
            {entry.state === "filled" && entry.elapsedSeconds != null && (
              <div className="kdate-jp text-[20px] tnum">
                {formatTime(entry.elapsedSeconds)}
              </div>
            )}
            {entry.state === "freeze" && (
              <div className="ital text-moss text-[14px]">kept by freeze</div>
            )}
            {entry.state === "empty" && (
              <div className="ital text-moss text-[14px]">missed</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
