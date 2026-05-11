import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { SYSTEM_PROMPT, userMessage, type CoachKind, type CoachPayload } from "@/lib/coach/prompt";
import { checkAndIncrement } from "@/lib/coach/usage";
import { findHintForCell } from "@/lib/sudoku/techniques";

export const runtime = "nodejs";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

function isValidBody(b: unknown): b is { board: number[]; target: number; kind: CoachKind } {
  if (!b || typeof b !== "object") return false;
  const x = b as Record<string, unknown>;
  if (!Array.isArray(x.board) || x.board.length !== 81) return false;
  if (!x.board.every((n) => Number.isInteger(n) && n >= 0 && n <= 9)) return false;
  if (typeof x.target !== "number" || !Number.isInteger(x.target) || x.target < 0 || x.target > 80) return false;
  if (x.kind !== "ask" && x.kind !== "nudge") return false;
  return true;
}

export async function POST(req: NextRequest) {
  // 1. Auth first (cheap; rejects unauthenticated requests before parsing)
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) return new Response("Sign in to use the coach", { status: 401 });

  // 2. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("bad-request", { status: 400 });
  }
  if (!isValidBody(body)) return new Response("bad-request", { status: 400 });
  const { board, target, kind } = body;

  // 3. Profile fetch (needed for tier-aware engine call)
  const { data: profile } = await sb
    .from("profiles")
    .select("is_pro")
    .eq("id", user.id)
    .maybeSingle();
  const isPro = !!profile?.is_pro;

  // 4. Engine first — quota is only consumed if Gemini is actually called.
  const result = findHintForCell(board, target, { proTechniques: isPro });
  if (!result) {
    return new Response("The board looks complete — nothing to hint.", { status: 200 });
  }

  // 5. Build coach payload
  const payload: CoachPayload =
    "downgrade" in result
      ? { kind: "downgrade", redirect: result.redirect, originalTarget: target }
      : {
          kind: "hint",
          hint: result.hint,
          originalTarget: result.hint.redirect ? target : undefined,
        };

  // 6. Gemini precondition — short-circuit before consuming quota.
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey)
    return new Response("[error] GOOGLE_API_KEY not set", { status: 500 });

  // 7. Rate gate
  const gate = await checkAndIncrement(user.id, isPro);
  if (!gate.ok)
    return new Response(
      "Daily AI limit reached. Upgrade to Pro for unlimited.",
      { status: 429 },
    );

  const ai = new GoogleGenAI({ apiKey });
  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(ctrl) {
      try {
        const stream = await ai.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: userMessage(payload, kind),
          config: {
            systemInstruction: SYSTEM_PROMPT,
            maxOutputTokens: 200,
          },
        });
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) ctrl.enqueue(encoder.encode(text));
        }
      } catch (e) {
        console.error("[coach] gemini error:", e);
        ctrl.enqueue(encoder.encode("\n[error] Sensei is offline."));
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
