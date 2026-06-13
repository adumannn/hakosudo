import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const sessionsRetrieve = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/auth/identity", () => ({
  getCurrentUser: () => getCurrentUser(),
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      checkout: { sessions: { retrieve: (...a: unknown[]) => sessionsRetrieve(...a) } },
    };
  }),
}));

beforeEach(() => {
  vi.resetModules();
  getCurrentUser.mockReset();
  sessionsRetrieve.mockReset();
  rpc.mockReset();
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
});

function authedUser() {
  return {
    user: { id: "u1", email: "a@b.co" },
    sb: { rpc: (name: string, args: unknown) => rpc(name, args) },
  };
}

async function postGrant(body: unknown) {
  const req = new Request("https://example.test/api/freezes/grant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const { POST } = await import("@/app/api/freezes/grant/route");
  return POST(req);
}

describe("POST /api/freezes/grant", () => {
  it("401s when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue({ user: null, sb: null });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(401);
  });

  it("400s when session_id missing", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    const res = await postGrant({});
    expect(res.status).toBe(400);
  });

  it("400s when payment_status is not paid", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "unpaid",
      metadata: { user_id: "u1", sku: "freeze_1", quantity: "1" },
    });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(400);
  });

  it("403s when metadata.user_id does not match auth user", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      metadata: { user_id: "other-user", sku: "freeze_1", quantity: "1" },
    });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(403);
  });

  it("400s when sku is not a known SKU", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      metadata: { user_id: "u1", sku: "freeze_99", quantity: "1" },
    });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(400);
  });

  it("grants credits on the happy path", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      amount_total: 300,
      metadata: { user_id: "u1", sku: "freeze_5", quantity: "5" },
    });
    rpc.mockResolvedValue({ data: [{ balance: 5, granted: 5 }], error: null });
    const res = await postGrant({ session_id: "sess_x" });

    expect(rpc).toHaveBeenCalledWith("grant_freeze_credits", {
      p_user_id: "u1",
      p_session_id: "sess_x",
      p_sku: "freeze_5",
      p_quantity: 5,
      p_amount_cents: 300,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, balance: 5, granted: 5 });
  });

  it("reports granted: 0 on replay (RPC returns same balance, granted=0)", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      amount_total: 100,
      metadata: { user_id: "u1", sku: "freeze_1", quantity: "1" },
    });
    rpc.mockResolvedValue({ data: [{ balance: 1, granted: 0 }], error: null });
    const res = await postGrant({ session_id: "sess_x" });
    const body = await res.json();
    expect(body).toEqual({ ok: true, balance: 1, granted: 0 });
  });

  it("400s when amount_total does not match the expected SKU price", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      amount_total: 999,  // expected 100 for freeze_1
      metadata: { user_id: "u1", sku: "freeze_1", quantity: "1" },
    });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad-session");
  });

  it("503s when the RPC errors", async () => {
    getCurrentUser.mockResolvedValue(authedUser());
    sessionsRetrieve.mockResolvedValue({
      id: "sess_x",
      payment_status: "paid",
      amount_total: 100,
      metadata: { user_id: "u1", sku: "freeze_1", quantity: "1" },
    });
    rpc.mockResolvedValue({ data: null, error: { message: "rpc boom" } });
    const res = await postGrant({ session_id: "sess_x" });
    expect(res.status).toBe(503);
  });
});
