"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

type NavKey = "today" | "play" | "ledger" | "profile" | "pro";

interface MastheadProps {
  active?: NavKey;
  initial?: string;
  /** Email of the signed-in user. When present, the avatar becomes an account dropdown. */
  email?: string | null;
  /** Replace nav with a thin in-game header (game title + timer + solved count) */
  variant?: "default" | "game";
  gameTitle?: string;
  timer?: React.ReactNode;
  solvedCount?: { filled: number; total: number };
  /** Game variant: callback for the mobile sensei trigger. */
  onSensei?: () => void;
}

function AvatarDropdown({
  initial,
  email,
}: {
  initial: string;
  email: string;
}) {
  const onSignOut = async () => {
    const sb = createClient();
    // Default scope is "global" — that signs out every device and can 403
    // when a third-party-cookie blocker stops the refresh-token cookie from
    // reaching the auth server. Retry with "local" so the current tab still
    // gets cleared, then redirect.
    let { error } = await sb.auth.signOut();
    if (error) {
      console.warn("[signOut] global failed, retrying local:", error);
      ({ error } = await sb.auth.signOut({ scope: "local" }));
    }
    if (error) {
      console.error("[signOut] local also failed:", error);
      window.alert(
        "Couldn't sign out — try clearing cookies for this site.",
      );
      return;
    }
    window.location.href = "/";
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="account menu"
        className="avatar focus:outline-none focus-visible:ring-2 focus-visible:ring-vermillion"
      >
        {initial.toUpperCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="bg-bone border-[1.5px] border-sumi rounded-none p-0 min-w-[200px] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.4)]"
      >
        <DropdownMenuLabel className="mono text-[10px] tracking-[0.18em] uppercase text-moss px-3 py-2.5 truncate">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-sumi/15 m-0" />
        <DropdownMenuItem asChild className="rounded-none focus:bg-rice cursor-pointer">
          <Link
            href="/profile"
            className="mincho text-[14px] text-sumi px-3 py-2.5 block"
          >
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="rounded-none focus:bg-rice cursor-pointer">
          <Link
            href="/achievements"
            className="mincho text-[14px] text-sumi px-3 py-2.5 block"
          >
            Achievements
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-sumi/15 m-0" />
        <DropdownMenuItem
          onSelect={onSignOut}
          className="rounded-none focus:bg-vermillion focus:text-bone cursor-pointer mincho text-[14px] text-vermillion px-3 py-2.5"
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const NAV: { key: NavKey; label: string; href: string }[] = [
  { key: "today", label: "Today", href: "/" },
  { key: "play", label: "Casual", href: "/play" },
  { key: "ledger", label: "Ledger", href: "/leaderboard" },
  { key: "profile", label: "Profile", href: "/profile" },
  { key: "pro", label: "Pro", href: "/pro" },
];

export function Masthead({
  active,
  initial = "·",
  email,
  variant = "default",
  gameTitle,
  timer,
  solvedCount,
  onSensei,
}: MastheadProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (variant === "game") {
    return (
      <header className="masthead">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="stamp">日</div>
            <div className="name truncate max-w-[160px] sm:max-w-none">
              {gameTitle ?? "Daily"}
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          {timer && (
            <div className="kdate-jp tnum text-xl sm:text-2xl font-medium tracking-[0.04em] text-sumi font-mono">
              {timer}
            </div>
          )}
          {solvedCount && (
            <div className="flex items-center gap-2">
              <span className="eyebrow hidden sm:inline">solved</span>
              <span className="mincho text-base sm:text-lg font-semibold text-vermillion">
                {solvedCount.filled}
                <span className="text-moss text-[12px] sm:text-[13px]">
                  /{solvedCount.total}
                </span>
              </span>
            </div>
          )}
          {onSensei && (
            <button
              type="button"
              onClick={onSensei}
              aria-label="open sensei"
              className="lg:hidden w-8 h-8 bg-sumi text-bone flex items-center justify-center mincho font-semibold text-[13px] hover:bg-sumi/90"
            >
              師
            </button>
          )}
          <div className="avatar">{initial.toUpperCase()}</div>
        </div>
      </header>
    );
  }

  return (
    <>
      <header className="masthead">
        <div className="flex items-center gap-3 md:gap-7">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="open menu"
            className="md:hidden w-8 h-8 flex flex-col justify-center items-center gap-[3px] border border-sumi bg-transparent"
          >
            <span className="block w-4 h-[1.5px] bg-sumi" />
            <span className="block w-4 h-[1.5px] bg-sumi" />
            <span className="block w-4 h-[1.5px] bg-sumi" />
          </button>
          <Link href="/" className="flex items-center gap-2.5">
            <div className="stamp">箱</div>
            <div className="name">Hako</div>
          </Link>
          <nav className="hidden md:flex gap-[22px]">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={cn(active === item.key && "on")}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-[16px] md:gap-[22px] text-[13px] text-moss">
          {email ? (
            <AvatarDropdown initial={initial} email={email} />
          ) : (
            <Link
              href="/auth/login"
              className="avatar hover:bg-vermillion hover:text-bone transition-colors"
              aria-label="sign in"
            >
              {initial.toUpperCase()}
            </Link>
          )}
        </div>
      </header>

      {menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-bone md:hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex justify-between items-center px-8 py-4 border-b-[1.5px] border-sumi">
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5"
            >
              <div className="stamp">箱</div>
              <div className="name">Hako</div>
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="close menu"
              className="mono text-[11px] tracking-[0.22em] uppercase text-moss hover:text-sumi"
            >
              close ×
            </button>
          </div>
          <nav className="flex flex-col px-8 py-6">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "mincho text-[28px] py-4 border-b border-sumi/12 flex justify-between items-center",
                  active === item.key
                    ? "text-sumi"
                    : "text-moss hover:text-sumi",
                )}
              >
                <span>{item.label}</span>
                {active === item.key && (
                  <span className="text-vermillion text-[20px]">·</span>
                )}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
