import type { Metadata, Viewport } from "next";
import {
  Plus_Jakarta_Sans,
  JetBrains_Mono,
  Cormorant_Garamond,
} from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { resolveActiveSkinServer } from "@/lib/skins/server";
import { getViewer } from "@/lib/skins/viewer";
import { SkinParticles } from "@/components/skins/SkinParticles";
import { SpeedInsights } from "@vercel/speed-insights/next";

const mincho = localFont({
  src: "./_fonts/shippori-mincho-700-hako.ttf",
  variable: "--font-mincho",
  display: "swap",
  fallback: ["Hiragino Mincho ProN", "Yu Mincho", "serif"],
});

const jakarta = Plus_Jakarta_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const mono = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  weight: ["500"],
  style: ["italic"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hako 箱 — a quieter sudoku",
  description:
    "A paper-and-ink sudoku. One box a day, one streak, no upsell ladder.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ECE3D0" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve the home/chrome skin once at the layout level.
  // Fetch the viewer once and pass it through so the resolver doesn't re-query.
  const viewer = await getViewer();
  const skin = await resolveActiveSkinServer({ surface: "home", viewer });

  return (
    <html
      lang="en"
      className={`${mincho.variable} ${jakarta.variable} ${mono.variable} ${cormorant.variable}`}
    >
      <body data-skin={skin.paletteKey}>
        {/* Ambient particle layer — fixed, behind content. */}
        <SkinParticles paletteKey={skin.paletteKey} />
        {/* Content stacking context, sits above the particle layer. */}
        <div className="hako-content">
          {children}
        </div>
        <SpeedInsights />
      </body>
    </html>
  );
}
