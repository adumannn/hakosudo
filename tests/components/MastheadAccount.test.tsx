import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MastheadAccount } from "@/components/MastheadAccount";

describe("MastheadAccount", () => {
  it("shows settings instead of account and keeps highlighted link text readable", async () => {
    render(
      <MastheadAccount initial="a" email="abdurahmanulyduman@gmail.com" />,
    );

    const trigger = screen.getByRole("button", { name: "account menu" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const settingsLink = await screen.findByRole("menuitem", {
      name: "Settings",
    });

    expect(settingsLink).toHaveAttribute("href", "/account");
    expect(screen.queryByRole("menuitem", { name: "Account" })).not.toBeInTheDocument();
    expect(settingsLink).toHaveClass("focus:bg-rice", "focus:text-sumi");
    expect(settingsLink.className).toContain("data-[highlighted]:text-sumi");
  });
});
