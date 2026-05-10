import { getViewer } from "@/lib/skins/viewer";
import { canApplyOverride } from "@/lib/skins/resolve";
import { resolveActiveSkinServer } from "@/lib/skins/server";
import { SkinPicker } from "./SkinPicker";

export async function SkinChip() {
  const viewer = await getViewer();

  // Free users never see this control. Per spec: setting an override is a
  // Pro-only capability. (Free users with one-off purchases also don't see
  // the picker — they're shown the catalog instead.)
  if (!viewer.isPro) return null;

  const wearable = viewer.allSkins.filter(
    (s) =>
      s.slug !== "default" &&
      canApplyOverride({
        isPro: viewer.isPro,
        skin: s,
        ownedSkinIds: viewer.ownedSkinIds,
      }),
  );

  const current = await resolveActiveSkinServer({ surface: "home", viewer });
  const currentName =
    current.slug === "default"
      ? "Default"
      : viewer.allSkins.find((s) => s.slug === current.slug)?.name ?? current.slug;

  return (
    <SkinPicker
      wearableSkins={wearable}
      activeSkinId={viewer.activeSkinId}
      currentLabel={currentName}
      currentKanji={current.kanjiLabel}
    />
  );
}
