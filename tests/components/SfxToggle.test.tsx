import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SfxToggle } from "@/components/account/SfxToggle";

vi.mock("@/app/actions/save-sfx-preference", () => ({
  saveSfxPreference: vi.fn(async ({ enabled }: { enabled: boolean }) => ({
    ok: true,
    enabled,
  })),
}));

vi.mock("@/lib/sfx", () => ({
  setSfxEnabled: vi.fn(),
}));

describe("SfxToggle", () => {
  it("keeps the switch track from shrinking beside the long sound label", () => {
    render(<SfxToggle initialEnabled={false} />);

    const switchButton = screen.getByRole("switch", {
      name: "sound on solve and number-pad",
    });
    const knob = switchButton.querySelector("span");
    const labelColumn = screen.getByText("sound on solve and number-pad")
      .parentElement;

    expect(labelColumn).toHaveClass("min-w-0");
    expect(switchButton).toHaveClass("w-14", "shrink-0");
    expect(knob).toHaveClass("left-1", "translate-x-0");
  });

  it("anchors the enabled knob inside the switch track", () => {
    render(<SfxToggle initialEnabled />);

    const switchButton = screen.getByRole("switch", {
      name: "sound on solve and number-pad",
    });
    const knob = switchButton.querySelector("span");

    expect(knob).toHaveClass("left-1", "translate-x-7");
  });
});
