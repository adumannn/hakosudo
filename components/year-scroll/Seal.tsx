"use client";
import { cn } from "@/lib/utils";
import type { SealState } from "@/lib/seal/types";

export interface SealProps {
  kanji?: string;
  state: SealState;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  onClick?: () => void;
  ariaLabel?: string;
}

const SIZES = {
  xs: { box: "text-[8px]", corner: "w-[5px] h-[5px] text-[3px] -bottom-[1px] -right-[1px]" },
  sm: { box: "text-[14px]", corner: "w-[8px] h-[8px] text-[5px] -bottom-[1px] -right-[1px]" },
  md: { box: "text-[22px]", corner: "w-[12px] h-[12px] text-[7px] bottom-[1px] right-[1px]" },
  lg: { box: "text-[96px]", corner: "w-[24px] h-[24px] text-[14px] bottom-[8px] right-[8px]" },
  xl: {
    box: "text-[clamp(200px,30vw,360px)]",
    corner: "w-[56px] h-[56px] text-[26px] bottom-[16px] right-[16px]",
  },
};

export function Seal({ kanji, state, size = "sm", onClick, ariaLabel }: SealProps) {
  const sz = SIZES[size];
  const interactive = !!onClick;

  const base =
    "relative aspect-square flex items-center justify-center leading-none mincho select-none";
  const stateClass = {
    filled: "border border-sumi/[0.16] text-sumi",
    today:
      "bg-vermillion/[0.04] border-[1.5px] border-vermillion/70 text-vermillion/45 motion-safe:animate-[seal-pulse_1.8s_ease-in-out_infinite]",
    empty: "border border-dashed border-sumi/[0.16]",
    future: "border border-sumi/[0.07]",
    freeze: "bg-sumi/[0.03] border border-dashed border-vermillion/40 text-sumi",
    "pre-signup": "border border-sumi/[0.04]",
  }[state];

  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(base, sz.box, stateClass, interactive && "cursor-pointer hover:bg-sumi/[0.06]")}
    >
      {(state === "filled" || state === "freeze") && kanji}
      {state === "filled" && (
        <span
          className={cn(
            "absolute bg-vermillion text-bone rounded-full flex items-center justify-center font-semibold",
            sz.corner,
          )}
          style={{ transform: "rotate(-6deg)" }}
        >
          ✓
        </span>
      )}
      {state === "freeze" && (
        <span
          className={cn(
            "absolute bg-bone text-vermillion rounded-full flex items-center justify-center mincho border border-vermillion/60",
            sz.corner,
          )}
        >
          凍
        </span>
      )}
    </Tag>
  );
}
