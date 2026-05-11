import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetSession, mockMaybeSingle, mockSelect, mockFrom, mockCheckAndIncrement, mockGenerateContentStream } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockCheckAndIncrement: vi.fn(),
  mockGenerateContentStream: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getSession: mockGetSession },
    from: mockFrom,
  }),
}));

vi.mock("@/lib/coach/usage", () => ({
  checkAndIncrement: mockCheckAndIncrement,
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContentStream: mockGenerateContentStream };
  },
}));

import { POST } from "@/app/api/coach/route";

const emptyBoard = Array(81).fill(0);
const solvedBoard = "534678912672195348198342567859761423426853791713924856961537284287419635345286179"
  .split("")
  .map(Number);

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/coach", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function readStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value);
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_API_KEY = "test-key";
  mockSelect.mockReturnValue({ eq: () => ({ maybeSingle: mockMaybeSingle }) });
  mockFrom.mockReturnValue({ select: mockSelect });
  mockMaybeSingle.mockResolvedValue({ data: { is_pro: false } });
  mockGenerateContentStream.mockResolvedValue(
    (async function* () {
      yield { text: "Sensei voice." };
    })(),
  );
});

describe("POST /api/coach", () => {
  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const res = await POST(makeReq({ board: emptyBoard, target: 0, kind: "nudge" }));
    expect(res.status).toBe(401);
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed body without consuming quota", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    const res = await POST(makeReq({ board: [1, 2, 3], target: 0, kind: "nudge" }));
    expect(res.status).toBe(400);
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
  });

  it("returns 400 when kind is invalid", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    const res = await POST(makeReq({ board: emptyBoard, target: 0, kind: "wat" }));
    expect(res.status).toBe(400);
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
  });

  it("returns 500 without consuming quota when GOOGLE_API_KEY is unset", async () => {
    delete process.env.GOOGLE_API_KEY;
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    const board = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) board[r * 9] = r + 1;
    const res = await POST(makeReq({ board, target: 0, kind: "ask" }));
    expect(res.status).toBe(500);
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
  });

  it("returns 200 with completion text on solved board, no quota consumed", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    const res = await POST(makeReq({ board: solvedBoard, target: 0, kind: "ask" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/board looks complete/i);
    expect(mockCheckAndIncrement).not.toHaveBeenCalled();
  });

  it("returns 429 when free user is at quota", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockCheckAndIncrement.mockResolvedValue({ ok: false, remaining: 0 });
    const board = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) board[r * 9] = r + 1;
    const res = await POST(makeReq({ board, target: 0, kind: "ask" }));
    expect(res.status).toBe(429);
  });

  it("streams Gemini output when hint is found and quota OK", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockCheckAndIncrement.mockResolvedValue({ ok: true, remaining: 19 });
    const board = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) board[r * 9] = r + 1;
    const res = await POST(makeReq({ board, target: 0, kind: "nudge" }));
    expect(res.status).toBe(200);
    const text = await readStream(res);
    expect(text).toBe("Sensei voice.");
    expect(mockGenerateContentStream).toHaveBeenCalled();
    const callArg = mockGenerateContentStream.mock.calls[0][0];
    expect(callArg.contents).toContain("Mode: nudge");
    expect(callArg.contents).not.toContain("Digit:");
  });

  it("includes Digit in the prompt when kind is ask", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockCheckAndIncrement.mockResolvedValue({ ok: true, remaining: 19 });
    const board = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) board[r * 9] = r + 1;
    const res = await POST(makeReq({ board, target: 0, kind: "ask" }));
    expect(res.status).toBe(200);
    await readStream(res);
    const callArg = mockGenerateContentStream.mock.calls[0][0];
    expect(callArg.contents).toContain("Mode: ask");
    expect(callArg.contents).toContain("Digit: 1");
  });

  it("streams a downgrade payload when free user hits a pro-tier position", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockCheckAndIncrement.mockResolvedValue({ ok: true, remaining: 19 });
    // Board where target has only a locked-candidate (pro-tier) hint available.
    // Box 0 has no 7; row 1 col 5 and row 2 col 4 have 7, so 7 in box 0 is locked to row 0.
    // Target = 1 (R1C2, in box 0). No naked/hidden single fires. Free user (is_pro: false by default).
    const board = Array(81).fill(0);
    board[14] = 7; // (1,5)
    board[22] = 7; // (2,4)
    const res = await POST(makeReq({ board, target: 1, kind: "ask" }));
    expect(res.status).toBe(200);
    await readStream(res);
    expect(mockGenerateContentStream).toHaveBeenCalled();
    const callArg = mockGenerateContentStream.mock.calls[0][0];
    expect(callArg.contents).toContain("Mode: downgrade");
  });

  it("falls back to engine voice when Gemini errors before emitting a token", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockCheckAndIncrement.mockResolvedValue({ ok: true, remaining: 19 });
    mockGenerateContentStream.mockRejectedValue(new Error("rate limit exceeded"));
    const board = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) board[r * 9] = r + 1;
    const res = await POST(makeReq({ board, target: 0, kind: "ask" }));
    expect(res.status).toBe(200);
    const text = await readStream(res);
    // Engine reason for naked-single at (0,0): "Cell R1C1 has only one possible digit (1)."
    expect(text).toContain("R1C1");
    expect(text).not.toContain("Sensei is offline");
  });

  it("preserves partial output when Gemini errors mid-stream", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    mockCheckAndIncrement.mockResolvedValue({ ok: true, remaining: 19 });
    mockGenerateContentStream.mockResolvedValue(
      (async function* () {
        yield { text: "Look at " };
        throw new Error("stream broke");
      })(),
    );
    const board = Array(81).fill(0);
    for (let r = 1; r <= 8; r++) board[r * 9] = r + 1;
    const res = await POST(makeReq({ board, target: 0, kind: "ask" }));
    const text = await readStream(res);
    // Partial Gemini output preserved; no fallback appended.
    expect(text).toBe("Look at ");
  });
});
