"use client";
import { createClient } from "@/lib/supabase/client";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function SignOutButton() {
  const sb = createClient();
  const onClick = async () => {
    await sb.auth.signOut();
    window.location.href = "/";
  };
  return (
    <DropdownMenuItem onSelect={onClick} className="text-destructive">
      Sign out
    </DropdownMenuItem>
  );
}
