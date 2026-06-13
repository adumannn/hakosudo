"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FreezeSheet } from "@/components/freezes/FreezeSheet";

interface UserMenuClientProps {
  email: string | null;
  displayName: string;
  signOut: React.ReactNode;
  freezeBalance: number;
  isPro: boolean;
  allotmentRemaining: number;
}

export function UserMenuClient({
  email,
  displayName,
  signOut,
  freezeBalance,
  isPro,
  allotmentRemaining,
}: UserMenuClientProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">{displayName}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {email && (
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {email}
            </DropdownMenuLabel>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">Profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSheetOpen(true); }}>
            Streak Freezes
            <span className="ml-auto mono text-[10px] tracking-[0.18em] text-muted-foreground">
              {freezeBalance}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/pro">Upgrade</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {signOut}
        </DropdownMenuContent>
      </DropdownMenu>

      <FreezeSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        balance={freezeBalance}
        isPro={isPro}
        allotmentRemaining={allotmentRemaining}
      />
    </>
  );
}
