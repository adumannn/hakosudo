import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const getProfile = vi.fn();
const rpc = vi.fn();
const fromBuilder = vi.fn();

vi.mock("@/lib/auth/identity", () => ({
  getCurrentUser: () => getCurrentUser(),
  getProfile: () => getProfile(),
}));

beforeEach(() => {
  vi.resetModules();
  getCurrentUser.mockReset();
  getProfile.mockReset();
  rpc.mockReset();
  fromBuilder.mockReset();
});

function authed(opts: {
  fromImpl: (table: string) => unknown;
  rpcImpl?: (name: string, args: unknown) => unknown;
}) {
  return {
    user: { id: "u1" },
    sb: {
      from: (t: string) => opts.fromImpl(t),
      rpc: (name: string, args: unknown) =>
        opts.rpcImpl ? opts.rpcImpl(name, args) : rpc(name, args),
    },
  };
}

const YESTERDAY = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

async function postFreeze(date: string) {
  const req = new Request("https://example.test/api/seal/freeze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date }),
  });
  const { POST } = await import("@/app/api/seal/freeze/route");
  return POST(req);
}

describe("POST /api/seal/freeze (extended)", () => {
  it("Pro user with remaining allotment: inserts streak_freezes directly", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const countSelect = vi.fn().mockReturnValue({
      eq: () => ({
        eq: () => Promise.resolve({ count: 0 }),
      }),
    });
    const completedMaybeSingle = vi.fn().mockResolvedValue({ data: null });
    const fromImpl = (table: string) => {
      if (table === "streak_freezes") {
        return {
          select: (cols: string, opts?: { count?: string; head?: boolean }) =>
            opts?.head ? countSelect(cols, opts) : { /* unused */ },
          insert: (row: unknown) => insert(row),
        };
      }
      if (table === "daily_results") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: completedMaybeSingle }),
            }),
          }),
        };
      }
      throw new Error("unexpected table " + table);
    };
    getCurrentUser.mockResolvedValue(authed({ fromImpl }));
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: true,
      freeze_credits: 0,
      created_at: "2025-01-01T00:00:00Z",
    });

    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.source).toBe("allotment");
    expect(insert).toHaveBeenCalledOnce();
  });

  it("Non-Pro user with credits: consumes via RPC", async () => {
    const completedMaybeSingle = vi.fn().mockResolvedValue({ data: null });
    const fromImpl = (table: string) => {
      if (table === "daily_results") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: completedMaybeSingle }),
            }),
          }),
        };
      }
      if (table === "streak_freezes") {
        return {
          select: () => ({
            eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }),
          }),
        };
      }
      throw new Error("unexpected table " + table);
    };
    const rpcImpl = vi.fn().mockResolvedValue({ data: 2, error: null });
    getCurrentUser.mockResolvedValue(authed({ fromImpl, rpcImpl }));
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: false,
      freeze_credits: 3,
      created_at: "2025-01-01T00:00:00Z",
    });

    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("credit");
    expect(body.balance).toBe(2);
    expect(rpcImpl).toHaveBeenCalledWith(
      "consume_freeze_credit",
      expect.objectContaining({ p_user_id: "u1", p_date: YESTERDAY }),
    );
  });

  it("Non-Pro user with no credits: 403 no-freezes", async () => {
    const completedMaybeSingle = vi.fn().mockResolvedValue({ data: null });
    const fromImpl = (table: string) => {
      if (table === "daily_results") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: completedMaybeSingle }) }) }),
        };
      }
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }) };
    };
    getCurrentUser.mockResolvedValue(authed({ fromImpl }));
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: false,
      freeze_credits: 0,
      created_at: "2025-01-01T00:00:00Z",
    });
    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("no-freezes");
  });

  it("Already-completed date: 400 already-completed", async () => {
    const completedMaybeSingle = vi.fn().mockResolvedValue({ data: { date: YESTERDAY } });
    const fromImpl = (table: string) => {
      if (table === "daily_results") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: completedMaybeSingle }) }) }),
        };
      }
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }) };
    };
    getCurrentUser.mockResolvedValue(authed({ fromImpl }));
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: false,
      freeze_credits: 5,
      created_at: "2025-01-01T00:00:00Z",
    });
    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(400);
  });

  it("RPC returns -1 (race or already-frozen): 403 no-freezes", async () => {
    const completedMaybeSingle = vi.fn().mockResolvedValue({ data: null });
    const fromImpl = (table: string) => {
      if (table === "daily_results") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: completedMaybeSingle }) }) }),
        };
      }
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }) };
    };
    const rpcImpl = vi.fn().mockResolvedValue({ data: -1, error: null });
    getCurrentUser.mockResolvedValue(authed({ fromImpl, rpcImpl }));
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: false,
      freeze_credits: 1,
      created_at: "2025-01-01T00:00:00Z",
    });
    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(403);
  });

  it("Unauthenticated: 401", async () => {
    getCurrentUser.mockResolvedValue({ user: null, sb: {} });
    const res = await postFreeze(YESTERDAY);
    expect(res.status).toBe(401);
  });

  it("Out-of-window date (today): 400", async () => {
    const today = new Date().toISOString().slice(0, 10);
    getCurrentUser.mockResolvedValue(
      authed({ fromImpl: () => ({}) as never }),
    );
    getProfile.mockResolvedValue({
      id: "u1",
      is_pro: true,
      freeze_credits: 0,
      created_at: "2025-01-01T00:00:00Z",
    });
    const res = await postFreeze(today);
    expect(res.status).toBe(400);
  });
});
