import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const sessionsCreate = vi.fn();

vi.mock("@/lib/auth/identity", () => ({
  getCurrentUser: () => getCurrentUser(),
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function () {
    return { checkout: { sessions: { create: (...args: unknown[]) => sessionsCreate(...args) } } };
  }),
}));

beforeEach(() => {
  vi.resetModules();
  getCurrentUser.mockReset();
  sessionsCreate.mockReset();
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  process.env.STRIPE_PRICE_ID_FREEZE_1 = "price_test_freeze_1";
  process.env.STRIPE_PRICE_ID_FREEZE_5 = "price_test_freeze_5";
});

async function postForm(formBody: Record<string, string>) {
  const form = new URLSearchParams(formBody);
  const req = new Request("https://example.test/api/freezes/checkout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const { POST } = await import("@/app/api/freezes/checkout/route");
  return POST(req);
}

describe("POST /api/freezes/checkout", () => {
  it("redirects to /auth/login when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue({ user: null });
    const res = await postForm({ sku: "freeze_1" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/auth/login");
  });

  it("400s an unknown SKU", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", email: "a@b.co" } });
    const res = await postForm({ sku: "freeze_999" });
    expect(res.status).toBe(400);
  });

  it("503s when the price env var is missing", async () => {
    delete process.env.STRIPE_PRICE_ID_FREEZE_1;
    getCurrentUser.mockResolvedValue({ user: { id: "u1", email: "a@b.co" } });
    const res = await postForm({ sku: "freeze_1" });
    expect(res.status).toBe(503);
  });

  it("503s when NEXT_PUBLIC_SITE_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    getCurrentUser.mockResolvedValue({ user: { id: "u1", email: "a@b.co" } });
    const res = await postForm({ sku: "freeze_1" });
    expect(res.status).toBe(503);
  });

  it("creates a session and 303s to its URL on the happy path", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", email: "a@b.co" } });
    sessionsCreate.mockResolvedValue({ url: "https://stripe.test/sess_x", id: "sess_x" });
    const res = await postForm({ sku: "freeze_5" });

    expect(sessionsCreate).toHaveBeenCalledOnce();
    const arg = sessionsCreate.mock.calls[0][0];
    expect(arg.mode).toBe("payment");
    expect(arg.line_items[0].price).toBe("price_test_freeze_5");
    expect(arg.line_items[0].quantity).toBe(1);
    expect(arg.success_url).toContain("/freezes/success?session_id=");
    expect(arg.cancel_url).toContain("/freezes/cancel");
    expect(arg.metadata).toEqual({ user_id: "u1", sku: "freeze_5", quantity: "5" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://stripe.test/sess_x");
  });
});
