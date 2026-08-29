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
    <div className="app-bg min-h-screen p-5 md:p-10">
      <main className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="card flex flex-col justify-between gap-5 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 text-slate-100">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Agency OS</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Secure operator access</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-200">
              Enterprise operations workspace for sales, delivery, finance, and people controls. Access is limited to provisioned core accounts.
            </p>
          </div>
          <div className="grid gap-2 text-sm">
            <div className="rounded-md border border-white/25 bg-white/10 px-3 py-2">Role-based access: `owner`, `hr`, and `cto`</div>
            <div className="rounded-md border border-white/25 bg-white/10 px-3 py-2">Confidentiality notice acknowledgment enforced</div>
            <div className="rounded-md border border-white/25 bg-white/10 px-3 py-2">Audit-ready actions across all write modules</div>
          </div>
        </section>

        <section className="card flex flex-col gap-5 md:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Sign In</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Welcome back</h2>
            </div>
            <Link href="/" className="text-sm font-medium text-accent hover:text-accent-strong">
              Back
            </Link>
          </div>

          <p className="text-sm text-muted">
            Use a pre-provisioned account. Self-signup is disabled to protect operational and financial data.
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

            {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-danger">{error}</p> : null}

            <button type="submit" disabled={pending} className="btn disabled:cursor-not-allowed">
              {pending ? "Signing in..." : "Access workspace"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
