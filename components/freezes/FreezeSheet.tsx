"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFreezeAmountCents } from "@/lib/stripe/freeze-prices";

interface FreezeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: number;
  isPro: boolean;
  allotmentRemaining: number;
}

export function FreezeSheet({
  open,
  onOpenChange,
  balance,
  isPro,
  allotmentRemaining,
}: FreezeSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-seal text-bone border-bone/10 max-w-[440px] p-0">
        <div className="px-8 py-7 border-b border-bone/10">
          <DialogTitle className="mincho text-[18px] font-semibold tracking-wide">
            Streak Freezes
          </DialogTitle>
        </div>

        <div className="px-8 py-7">
          <div className="kdate-jp text-[56px] leading-none">{balance}</div>
          <div className="mono text-[11px] tracking-[0.2em] uppercase text-bone/55 mt-2">
            {balance === 1 ? "freeze" : "freezes"} in your box
          </div>
          {isPro && (
            <div className="mono text-[11px] tracking-[0.2em] uppercase text-bone/45 mt-1">
              + {allotmentRemaining} monthly · Pro
            </div>
          )}

          <p className="ital text-bone/70 text-[15px] mt-6 leading-[1.5] max-w-[34ch]">
            Recover a missed day within 24 hours. Keeps your streak alive.
          </p>
        </div>

        <div className="px-8 pb-7 grid gap-3">
          <form action="/api/freezes/checkout" method="POST">
            <input type="hidden" name="sku" value="freeze_1" />
            <button
              type="submit"
              className="btn-hako ghost border-bone text-bone w-full justify-between"
            >
              <span>1 freeze</span>
              <span className="font-jakarta font-light">${getFreezeAmountCents("freeze_1") / 100}</span>
            </button>
          </form>
          <form action="/api/freezes/checkout" method="POST">
            <input type="hidden" name="sku" value="freeze_5" />
            <button
              type="submit"
              className="btn-hako red w-full justify-between"
            >
              <span>
                5 freezes <span className="text-bone/70 text-[11px] mono ml-2">save 40%</span>
              </span>
              <span className="font-jakarta font-light">${getFreezeAmountCents("freeze_5") / 100}</span>
            </button>
          </form>
        </div>

        <div className="px-8 pb-6 border-t border-bone/10 pt-4">
          <p className="mono text-[10px] tracking-[0.18em] uppercase text-bone/40">
            Sandbox · use Stripe test card ending in 4242
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
