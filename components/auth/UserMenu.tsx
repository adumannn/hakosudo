import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutButton } from "./SignOutButton";

export async function UserMenu() {
  const sb = createServerClient();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return (
      <Link href="/auth/login" className="text-sm hover:underline">
        Sign in
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          {user.email?.split("@")[0] ?? "Account"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/stats">Stats</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/pro">Upgrade</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
