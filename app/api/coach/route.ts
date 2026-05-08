import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { SYSTEM_PROMPT, userMessage } from "@/lib/coach/prompt";
import { checkAndIncrement } from "@/lib/coach/usage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const {
    data: { session },
  } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) return new Response("Sign in to use the coach", { status: 401 });

  const { data: profile } = await sb
    .from("profiles")
    .select("is_pro")
    .eq("id", user.id)
    .maybeSingle();
  const gate = await checkAndIncrement(user.id, !!profile?.is_pro);
  if (!gate.ok)
    return new Response(
      "Daily AI limit reached. Upgrade to Pro for unlimited.",
      { status: 429 }
    );

  const body = (await req.json()) as { board: number[]; target: number };
  if (!Array.isArray(body.board) || body.board.length !== 81)
    return new Response("bad-request", { status: 400 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const stream = client.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage(body.board, body.target) }],
  });

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(ctrl) {
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            ctrl.enqueue(encoder.encode(ev.delta.text));
          }
        }
      } catch {
        ctrl.enqueue(encoder.encode("\n[error]"));
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
