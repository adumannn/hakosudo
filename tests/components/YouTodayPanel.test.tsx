// tests/components/YouTodayPanel.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { YouTodayPanel } from "@/components/stats/YouTodayPanel";

describe("YouTodayPanel", () => {
  it("renders pre-stamp state with dashes for today and rank", () => {
    render(
      <YouTodayPanel
        streak={3}
        yearFilled={120}
        yearTotal={365}
        todayElapsed={null}
        todayRank={null}
      />,
    );
    expect(screen.getByText("YOU TODAY")).toBeInTheDocument();
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(screen.getByText("120 / 365")).toBeInTheDocument();
    // TODAY and RANK rows show "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders post-stamp state with formatted time and rank", () => {
    render(
      <YouTodayPanel
        streak={13}
        yearFilled={248}
        yearTotal={365}
        todayElapsed={402}
        todayRank={{ rank: 14, total: 1247 }}
      />,
    );
    expect(screen.getByText("13 days")).toBeInTheDocument();
    expect(screen.getByText("248 / 365")).toBeInTheDocument();
    expect(screen.getByText("6:42")).toBeInTheDocument();
    expect(screen.getByText("#14 / 1,247")).toBeInTheDocument();
  });

  it("renders 0 streak as '0 days' (not '—')", () => {
    render(
      <YouTodayPanel
        streak={0}
        yearFilled={0}
        yearTotal={365}
        todayElapsed={null}
        todayRank={null}
      />,
    );
    expect(screen.getByText("0 days")).toBeInTheDocument();
  });

  it("renders 1 streak as '1 day' (singular)", () => {
    render(
      <YouTodayPanel
        streak={1}
        yearFilled={1}
        yearTotal={365}
        todayElapsed={null}
        todayRank={null}
      />,
    );
    expect(screen.getByText("1 day")).toBeInTheDocument();
  });

  it("highlights streak in vermillion when streak >= 7", () => {
    render(
      <YouTodayPanel
        streak={9}
        yearFilled={9}
        yearTotal={365}
        todayElapsed={null}
        todayRank={null}
      />,
    );
    const streakValue = screen.getByText("9 days");
    expect(streakValue.className).toContain("text-vermillion");
  });

  it("does NOT highlight streak when streak < 7", () => {
    render(
      <YouTodayPanel
        streak={3}
        yearFilled={3}
        yearTotal={365}
        todayElapsed={null}
        todayRank={null}
      />,
    );
    const streakValue = screen.getByText("3 days");
    expect(streakValue.className).not.toContain("text-vermillion");
  });
});
