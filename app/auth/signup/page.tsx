import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";

export default function Signup() {
  return (
    <main className="container max-w-md py-12">
      <h1 className="text-2xl font-bold mb-6">Create account</h1>
      <AuthForm mode="signup" />
      <p className="text-sm text-muted-foreground mt-4">
        Already have one? <Link href="/auth/login" className="underline">Sign in</Link>
      </p>
    </main>
  );
}
