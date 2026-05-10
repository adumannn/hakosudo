"use client";
import { useTransition } from "react";
import { setActiveSkin } from "@/app/actions/skins";
import type { SkinRecord } from "@/lib/skins/types";
import type { CatalogAction } from "@/lib/skins/catalog";

interface SkinCardProps {
  skin: SkinRecord;
  action: CatalogAction;
}

function priceLabel(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function SkinCard({ skin, action }: SkinCardProps) {
  const [pending, startTransition] = useTransition();

  if (action.kind === "hidden") return null;

  return (
    <article
      data-skin={skin.palette_key}
      className="border border-sumi/15 p-6 flex flex-col gap-4 bg-bone"
    >
      <header className="flex items-baseline gap-3">
        <div className="stamp text-[28px]">{skin.kanji_label}</div>
        <div>
          <div className="mincho text-[18px] text-sumi font-semibold">{skin.name}</div>
          <div className="mono text-[10px] tracking-[0.18em] uppercase text-moss mt-0.5">
            {skin.kind === "season"
              ? "seasonal volume"
              : skin.kind === "limited"
                ? "challenge unlock"
                : "premium edition"}
          </div>
        </div>
      </header>

      <div className="ital text-sumi/70 text-[14px]">{skin.masthead}</div>

      <footer className="mt-auto pt-2">
        {renderAction(action, pending, startTransition)}
      </footer>
    </article>
  );
}

function renderAction(
  action: CatalogAction,
  pending: boolean,
  startTransition: React.TransitionStartFunction,
) {
  switch (action.kind) {
    case "wearing":
      return (
        <div className="flex items-center justify-between gap-3">
          <span className="mono text-[11px] tracking-[0.18em] uppercase text-vermillion">
            wearing now
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => void setActiveSkin(null))}
            className="mono text-[11px] tracking-[0.18em] uppercase text-moss hover:text-sumi disabled:opacity-50"
          >
            revert
          </button>
        </div>
      );
    case "wear":
      return (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => void setActiveSkin(action.skinId))}
          className="btn-hako w-full justify-center disabled:opacity-50"
        >
          Wear this
        </button>
      );
    case "wear-included":
      return (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => void setActiveSkin(action.skinId))}
          className="btn-hako w-full justify-between disabled:opacity-50"
        >
          <span>Wear · included with Pro</span>
          <span className="font-jakarta font-light">→</span>
        </button>
      );
    case "buy":
      return (
        <form action="/api/stripe/checkout/skin" method="POST">
          <input type="hidden" name="slug" value={action.slug} />
          <button type="submit" className="btn-hako red w-full justify-between">
            <span>Buy · {priceLabel(action.priceCents)}</span>
            <span className="font-jakarta font-light">→</span>
          </button>
        </form>
      );
    case "in-print":
      return (
        <div className="mono text-[11px] tracking-[0.18em] uppercase text-vermillion">
          in print now
        </div>
      );
    case "back-issue":
      return (
        <div className="mono text-[11px] tracking-[0.18em] uppercase text-moss">
          from {action.seasonName}
        </div>
      );
    case "future": {
      const formatted = new Date(action.startDate + "T00:00:00").toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" },
      );
      return (
        <div className="mono text-[11px] tracking-[0.18em] uppercase text-moss/70">
          coming {formatted}
        </div>
      );
    }
    case "locked-challenge":
      return (
        <div className="flex items-baseline justify-between gap-3">
          <span className="mono text-[11px] tracking-[0.18em] uppercase text-moss/70">
            locked
          </span>
          <span className="mincho text-[13px] text-sumi/70 italic">
            {action.hint}
          </span>
        </div>
      );
    case "hidden":
      return null;
  }
}
