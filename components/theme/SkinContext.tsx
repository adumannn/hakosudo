"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { SkinResolved } from "@/lib/skins/types";

const DEFAULT_SKIN: SkinResolved = {
  slug: "default",
  paletteKey: "default",
  sealKanji: "完",
  masthead: "Today's box.",
  kanjiLabel: "完",
};

const SkinContext = createContext<SkinResolved>(DEFAULT_SKIN);

export function SkinProvider({ skin, children }: { skin: SkinResolved; children: ReactNode }) {
  return <SkinContext.Provider value={skin}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinResolved {
  return useContext(SkinContext);
}
