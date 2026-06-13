import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "@/lib/promise/with-timeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the value when the promise settles in time", async () => {
    const result = withTimeout(Promise.resolve("ok"), 1000);
    await expect(result).resolves.toBe("ok");
  });

  it("rejects with the original error when the promise rejects in time", async () => {
    const boom = new Error("boom");
    const result = withTimeout(Promise.reject(boom), 1000);
    await expect(result).rejects.toBe(boom);
  });

  it("rejects with a TimeoutError once the deadline passes", async () => {
    // A promise that never settles on its own.
    const result = withTimeout(new Promise<never>(() => {}), 3000);
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });

  it("clears the timer when the promise wins so the process can exit", async () => {
    const clearSpy = vi.spyOn(global, "clearTimeout");
    await withTimeout(Promise.resolve("done"), 5000);
    expect(clearSpy).toHaveBeenCalled();
  });
});
