"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !data.session) {
        setError(signInError?.message ?? "Login failed.");
        setPending(false);
        return;
      }

      router.push("/");
      router.refresh();
      return;
    } catch {
      setError("Unexpected login error. Please retry.");
    }

    setPending(false);
  }

  return (
    <div className="app-bg min-h-screen p-6 md:p-12">
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-sm md:p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <Link href="/" className="text-sm font-medium text-accent hover:text-accent-strong">
            Back
          </Link>
        </div>

        <p className="text-sm text-muted">
          Use one of the three pre-provisioned core accounts (`owner`, `hr`, `cto`). Self-signup is disabled.
        </p>
        <p className="text-xs text-muted">
          Local setup requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
        </p>

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
              placeholder="owner@agency.local"
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input"
              placeholder="Your Supabase password"
            />
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="btn disabled:cursor-not-allowed"
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
