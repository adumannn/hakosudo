import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";

export default function Login() {
  return (
    <main className="container max-w-md py-12">
      <h1 className="text-2xl font-bold mb-6">Sign in</h1>
      <AuthForm mode="signin" />
      <p className="text-sm text-muted-foreground mt-4">
        New here? <Link href="/auth/signup" className="underline">Create an account</Link>
      </p>
    </main>
  );
}
