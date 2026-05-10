"use client";

import { useEffect, useRef } from "react";

type ParticleMode = "fall" | "firefly" | "rise" | "swim";

interface ParticleConfig {
  count: number;
  size: [number, number];   // px
  dur: [number, number];    // seconds
  swayMax: number;          // px
  rotate?: boolean;
  mode?: ParticleMode;      // defaults to "fall"
}

// Per-paletteKey particle config. Keep in sync with the @keyframes and
// per-skin overrides in app/globals.css. Counts are deliberately small
// (5–20) so there's no perf concern even with multiple instances.
const CONFIG: Record<string, ParticleConfig> = {
  default: { count: 14, size: [4, 9],   dur: [18, 28],   swayMax: 40,  rotate: false },
  spring:  { count: 16, size: [11, 20], dur: [11, 20],   swayMax: 90,  rotate: true  },
  summer:  { count: 11, size: [4, 7],   dur: [4.5, 8.5], swayMax: 38,  rotate: false, mode: "firefly" },
  autumn:  { count: 13, size: [13, 22], dur: [10, 18],   swayMax: 110, rotate: true  },
  winter:  { count: 20, size: [7, 14],  dur: [16, 28],   swayMax: 60,  rotate: false },
  sumi:    { count: 8,  size: [10, 18], dur: [22, 34],   swayMax: 30,  rotate: false },
  indigo:  { count: 14, size: [7, 13],  dur: [16, 26],   swayMax: 50,  rotate: false },
  matsuri: { count: 18, size: [4, 9],   dur: [5, 9],     swayMax: 50,  rotate: false, mode: "rise" },
  koi:     { count: 5,  size: [22, 36], dur: [12, 22],   swayMax: 0,   rotate: false, mode: "swim" },
  yurei:   { count: 7,  size: [14, 24], dur: [9, 16],    swayMax: 70,  rotate: false, mode: "rise" },
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface SkinParticlesProps {
  /** The resolved skin's `paletteKey` (e.g. "spring", "sumi", "matsuri"). */
  paletteKey: string;
}

/**
 * Per-skin ambient particle layer. Renders an aria-hidden div that, on mount,
 * is populated with N randomized spans whose CSS animations + per-skin masks
 * deliver the skin's particle personality (sakura petals, fireflies, koi, …).
 *
 * The layer is `position: fixed`, sits below content (z-index: 0), and is
 * pointer-events: none. CSS variables for the mask/tint/alpha/animation come
 * from the nearest ancestor with `[data-skin]` (typically `<body>`).
 */
export function SkinParticles({ paletteKey }: SkinParticlesProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;

    // Clear any previous spans (re-runs on paletteKey change).
    layer.innerHTML = "";

    const cfg = CONFIG[paletteKey];
    if (!cfg) return; // unknown palette → render nothing

    const fragment = document.createDocumentFragment();
    const driftPx = typeof window !== "undefined" ? window.innerWidth + 80 : 800;

    for (let i = 0; i < cfg.count; i++) {
      const s = document.createElement("span");
      const style = s.style;

      style.setProperty("--sz", rand(cfg.size[0], cfg.size[1]).toFixed(1) + "px");
      style.setProperty("--x", rand(-2, 100).toFixed(1) + "%");
      style.setProperty("--sway", rand(-cfg.swayMax, cfg.swayMax).toFixed(0) + "px");
      style.setProperty("--dur", rand(cfg.dur[0], cfg.dur[1]).toFixed(1) + "s");
      // Negative delay → particles are mid-flight on first paint, not all stacked at the top.
      style.setProperty("--delay", (-rand(0, cfg.dur[1])).toFixed(1) + "s");
      style.setProperty("--peak", rand(0.55, 1).toFixed(2));

      if (cfg.rotate) {
        style.setProperty("--rot-mid", rand(-220, 220).toFixed(0) + "deg");
        style.setProperty("--rot-end", rand(-360, 360).toFixed(0) + "deg");
      } else {
        style.setProperty("--rot-mid", "0deg");
        style.setProperty("--rot-end", "0deg");
      }

      if (cfg.mode === "firefly") {
        style.setProperty("--y", rand(15, 80).toFixed(0) + "%");
      }
      if (cfg.mode === "rise") {
        // Rise mode randomizes x more conservatively (no negative bleed).
        style.setProperty("--x", rand(0, 95).toFixed(1) + "%");
      }
      if (cfg.mode === "swim") {
        style.setProperty("--y", rand(20, 80).toFixed(0) + "%");
        style.setProperty("--drift", driftPx.toFixed(0) + "px");
        style.setProperty("--bob", rand(-10, 10).toFixed(0) + "px");
      }

      fragment.appendChild(s);
    }
    layer.appendChild(fragment);
  }, [paletteKey]);

  return <div ref={ref} className="hako-particles" aria-hidden="true" />;
}
