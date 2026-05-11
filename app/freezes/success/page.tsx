"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function FreezesSuccess() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = React.useState<
    | { kind: "pending" }
    | { kind: "ok"; balance: number; granted: number }
    | { kind: "error"; message: string }
  >({ kind: "pending" });

  React.useEffect(() => {
    if (!sessionId) {
      setState({ kind: "error", message: "Missing session id." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/freezes/grant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          setState({ kind: "error", message: body.error ?? "Unknown error." });
        } else {
          setState({ kind: "ok", balance: body.balance, granted: body.granted });
        }
      } catch {
        if (cancelled) return;
        setState({ kind: "error", message: "Network error." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <main className="bg-seal text-bone min-h-screen flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {state.kind === "pending" && (
          <>
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-bone/55">
              Finishing up…
            </div>
            <div className="ital text-bone/70 mt-3">crediting your freezes</div>
          </>
        )}
        {state.kind === "ok" && (
          <>
            <div className="kdate-jp text-[88px] text-vermillion leading-none">
              +{state.granted}
            </div>
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-bone/55 mt-2">
              streak {state.granted === 1 ? "freeze" : "freezes"}
            </div>
            <div className="ital text-bone/70 mt-6 text-[16px]">
              balance · {state.balance}
            </div>
            <div className="mt-10 flex gap-3 justify-center">
              <Link href="/" className="btn-hako ghost border-bone text-bone">
                back to today
              </Link>
              <Link href="/" className="btn-hako red">
                done
              </Link>
            </div>
          </>
        )}
        {state.kind === "error" && (
          <>
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-hazard">
              Couldn&rsquo;t confirm purchase
            </div>
            <p className="ital text-bone/70 mt-3 text-[15px]">{state.message}</p>
            <Link href="/" className="btn-hako ghost border-bone text-bone mt-8">
              back to today
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
