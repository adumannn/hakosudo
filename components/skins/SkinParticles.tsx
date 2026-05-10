import type { CSSProperties } from "react";

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

interface SkinParticlesProps {
  /** The resolved skin's `paletteKey` (e.g. "spring", "sumi", "matsuri"). */
  paletteKey: string;
}

type ParticleStyle = CSSProperties & Record<`--${string}`, string>;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRand(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function between(rand: () => number, a: number, b: number): number {
  return a + rand() * (b - a);
}

/**
 * Per-skin ambient particle layer. Renders an aria-hidden div populated with
 * deterministic spans whose CSS animations + per-skin masks
 * deliver the skin's particle personality (sakura petals, fireflies, koi, …).
 *
 * The layer is `position: fixed`, sits below content (z-index: 0), and is
 * pointer-events: none. CSS variables for the mask/tint/alpha/animation come
 * from the nearest ancestor with `[data-skin]` (typically `<body>`).
 */
export function SkinParticles({ paletteKey }: SkinParticlesProps) {
  const cfg = CONFIG[paletteKey];

  if (!cfg) {
    return <div className="hako-particles" aria-hidden="true" />;
  }

  const rand = makeRand(hashString(paletteKey));
  const particles = Array.from({ length: cfg.count }, () => {
    const style: ParticleStyle = {
      "--sz": `${between(rand, cfg.size[0], cfg.size[1]).toFixed(1)}px`,
      "--x": `${between(rand, -2, 100).toFixed(1)}%`,
      "--sway": `${between(rand, -cfg.swayMax, cfg.swayMax).toFixed(0)}px`,
      "--dur": `${between(rand, cfg.dur[0], cfg.dur[1]).toFixed(1)}s`,
      // Negative delay -> particles are mid-flight on first paint, not all stacked at the top.
      "--delay": `${(-between(rand, 0, cfg.dur[1])).toFixed(1)}s`,
      "--peak": between(rand, 0.55, 1).toFixed(2),
      "--rot-mid": cfg.rotate
        ? `${between(rand, -220, 220).toFixed(0)}deg`
        : "0deg",
      "--rot-end": cfg.rotate
        ? `${between(rand, -360, 360).toFixed(0)}deg`
        : "0deg",
    };

    if (cfg.mode === "firefly") {
      style["--y"] = `${between(rand, 15, 80).toFixed(0)}%`;
    }
    if (cfg.mode === "rise") {
      // Rise mode randomizes x more conservatively (no negative bleed).
      style["--x"] = `${between(rand, 0, 95).toFixed(1)}%`;
    }
    if (cfg.mode === "swim") {
      style["--y"] = `${between(rand, 20, 80).toFixed(0)}%`;
      style["--drift"] = "calc(100vw + 80px)";
      style["--bob"] = `${between(rand, -10, 10).toFixed(0)}px`;
    }

    const particleKey = [
      paletteKey,
      style["--x"],
      style["--y"] ?? "",
      style["--delay"],
      style["--sway"],
    ].join(":");

    return <span key={particleKey} style={style} />;
  });

  return (
    <div className="hako-particles" aria-hidden="true">
      {particles}
    </div>
  );
}
