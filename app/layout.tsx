import type { Metadata, Viewport } from "next";
import {
  Shippori_Mincho,
  Plus_Jakarta_Sans,
  JetBrains_Mono,
  Cormorant_Garamond,
} from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { resolveActiveSkinServer } from "@/lib/skins/server";
import { SkinProvider } from "@/components/theme/SkinContext";

const mincho = Shippori_Mincho({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-mincho",
  display: "swap",
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
  // /play/daily and /play/[difficulty] re-wrap with their own SkinProvider downstream.
  const skin = await resolveActiveSkinServer({ surface: "home" });

  return (
    <html
      lang="en"
      className={`${mincho.variable} ${jakarta.variable} ${mono.variable} ${cormorant.variable}`}
    >
      <body data-skin={skin.paletteKey}>
        <SkinProvider skin={skin}>
          {children}
          <Toaster />
        </SkinProvider>
      </body>
    </html>
  );
}
