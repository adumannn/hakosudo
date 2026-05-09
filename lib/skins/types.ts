export type SkinKind = "season" | "premium" | "limited";
export type Surface = "home" | "casual" | "daily";

export interface SkinRecord {
  id: string;
  slug: string;
  kind: SkinKind;
  name: string;
  kanji_label: string;     // 春 / 墨 — the spine glyph
  seal_kanji: string;      // 桜 / 墨 — the seal glyph
  palette_key: string;     // matches CSS [data-skin="<key>"]
  masthead: string;        // "Today's bloom."
  start_date: string | null; // ISO date
  end_date: string | null;
  price_cents: number | null;
  active: boolean;
}

export interface SkinResolved {
  slug: string;
  paletteKey: string;
  sealKanji: string;
  masthead: string;
  kanjiLabel: string;
}

export interface SkinRegistryEntry {
  paletteKey: string;
  sealKanji: string;
  masthead: string;
  kanjiLabel: string;
}
