"use client";

import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveSkin } from "@/app/actions/skins";
import type { SkinRecord } from "@/lib/skins/types";

interface SkinPickerProps {
  wearableSkins: SkinRecord[];
  activeSkinId: string | null;
  currentLabel: string;
  currentKanji: string;
}

export function SkinPicker({
  wearableSkins,
  activeSkinId,
  currentLabel,
  currentKanji,
}: SkinPickerProps) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const onPick = (id: string | null) => {
    setOpen(false);
    startTransition(() => void setActiveSkin(id));
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        disabled={pending}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-sumi/20 hover:border-sumi/40 transition-colors disabled:opacity-50 mono text-[10px] tracking-[0.16em] uppercase text-moss focus:outline-none focus-visible:ring-2 focus-visible:ring-vermillion"
        aria-label={`change skin · currently ${currentLabel}`}
      >
        <span className="mincho text-[14px] text-sumi normal-case tracking-normal">
          {currentKanji}
        </span>
        <span>wearing · {currentLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="bg-bone border-[1.5px] border-sumi rounded-none p-0 min-w-[220px] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.4)]"
      >
        <DropdownMenuLabel className="mono text-[10px] tracking-[0.18em] uppercase text-moss px-3 py-2.5">
          choose a skin
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-sumi/15 m-0" />

        <DropdownMenuItem
          onSelect={() => onPick(null)}
          className="rounded-none focus:bg-rice cursor-pointer mincho text-[14px] text-sumi px-3 py-2.5 flex justify-between"
        >
          <span>Use the season&rsquo;s skin</span>
          {activeSkinId === null && <span className="text-vermillion">·</span>}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-sumi/15 m-0" />

        {wearableSkins.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => onPick(s.id)}
            className="rounded-none focus:bg-rice cursor-pointer mincho text-[14px] text-sumi px-3 py-2.5 flex justify-between"
          >
            <span className="flex items-center gap-2">
              <span className="text-[16px]">{s.kanji_label}</span>
              <span>{s.name}</span>
            </span>
            {activeSkinId === s.id && <span className="text-vermillion">·</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
