"use client";

import Link from "next/link";
import type { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const menuLinkClass =
  "rounded-none cursor-pointer focus:bg-rice focus:text-sumi data-[highlighted]:bg-rice data-[highlighted]:text-sumi hover:bg-rice hover:text-sumi";

export function MastheadAccount({
  initial,
  email,
}: {
  initial: string;
  email: string;
}) {
  const onSignOut = async () => {
    let sb: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      const { createClient } = await import("@/lib/supabase/client");
      sb = createClient();
    } catch (error) {
      console.error("[signOut] failed to load Supabase client:", error);
      window.alert("Couldn't load sign-out controls — refresh and try again.");
      return;
    }

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
    window.location.replace("/");
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
        <DropdownMenuItem asChild className={menuLinkClass}>
          <Link
            href="/profile"
            className="mincho text-[14px] text-sumi px-3 py-2.5 block"
          >
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={menuLinkClass}>
          <Link
            href="/account"
            className="mincho text-[14px] text-sumi px-3 py-2.5 block"
          >
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={menuLinkClass}>
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
          className="rounded-none focus:bg-vermillion focus:text-bone data-[highlighted]:bg-vermillion data-[highlighted]:text-bone hover:bg-vermillion hover:text-bone cursor-pointer mincho text-[14px] text-vermillion px-3 py-2.5"
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
