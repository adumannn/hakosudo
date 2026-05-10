"use client";

import { useState, useTransition } from "react";
import { saveSfxPreference } from "@/app/actions/save-sfx-preference";
import { setSfxEnabled } from "@/lib/sfx";
import { cn } from "@/lib/utils";

interface SfxToggleProps {
  initialEnabled: boolean;
}

export function SfxToggle({ initialEnabled }: SfxToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const update = (next: boolean) => {
    const prev = enabled;
    setEnabled(next);
    setError(false);
    setSfxEnabled(next);

    startTransition(async () => {
      try {
        const result = await saveSfxPreference({ enabled: next });
        if (!result.ok) {
          setEnabled(prev);
          setSfxEnabled(prev);
          setError(true);
          return;
        }

        setEnabled(result.enabled);
        setSfxEnabled(result.enabled);
      } catch {
        setEnabled(prev);
        setSfxEnabled(prev);
        setError(true);
      }
    });
  };

  return (
    <div className="border-t border-sumi/18 pt-6">
      <div className="flex items-center justify-between gap-6">
        <div>
          <div
            id="sfx-toggle-label"
            className="mono text-[10.5px] tracking-[0.22em] uppercase text-moss"
          >
            sound on solve and number-pad
          </div>
          <div className="ital text-[14px] text-moss mt-1">
            {enabled ? "enabled." : "silent."}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-labelledby="sfx-toggle-label"
          aria-checked={enabled}
          disabled={pending}
          onClick={() => update(!enabled)}
          className={cn(
            "relative h-8 w-14 border-[1.5px] border-sumi transition-colors disabled:opacity-60",
            enabled ? "bg-vermillion" : "bg-rice",
          )}
        >
          <span
            className={cn(
              "absolute top-1/2 h-5 w-5 -translate-y-1/2 bg-sumi transition-transform",
              enabled ? "translate-x-[26px] bg-bone" : "translate-x-1",
            )}
          />
        </button>
      </div>
      {error && (
        <div className="mono text-[10px] tracking-[0.2em] uppercase text-hazard mt-3">
          not stored
        </div>
      )}
    </div>
  );
}
