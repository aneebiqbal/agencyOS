"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearActiveOrgId } from "@/lib/client-org";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const CORE_ROLE_PRESETS = [
  { label: "Owner", email: "owner@agency.local" },
  { label: "HR", email: "hr@agency.local" },
  { label: "CTO", email: "cto@agency.local" },
] as const;

function sanitizeNextPath(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode] = useState<"standard" | "demo">(() => {
    if (typeof window === "undefined") {
      return "standard";
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "demo" ? "demo" : "standard";
  });
  const [nextPath] = useState(() => {
    if (typeof window === "undefined") {
      return "/workspace";
    }
    const params = new URLSearchParams(window.location.search);
    const resolvedMode = params.get("mode") === "demo" ? "demo" : "standard";
    const defaultPath = resolvedMode === "demo" ? "/workspace?demo=1" : "/workspace";
    return sanitizeNextPath(params.get("next"), defaultPath);
  });

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

      clearActiveOrgId();
      router.push(nextPath);
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
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Agency OS</p>
              {mode === "demo" ? (
                <span className="rounded-full border border-emerald-300/60 bg-emerald-300/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-200">
                  Demo Session
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              {mode === "demo" ? "Launch the guided investor walkthrough" : "Secure operator access"}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-200">
              {mode === "demo"
                ? "Sign in with a provisioned account to open the lead-to-cash flow in demo mode and walk the complete operating story."
                : "Enterprise operations workspace for sales, delivery, finance, and people controls. Access is limited to provisioned core accounts."}
            </p>
          </div>
          <div className="grid gap-2 text-sm">
            <div className="rounded-md border border-white/25 bg-white/10 px-3 py-2">Role-based access: `owner`, `hr`, and `cto`</div>
            <div className="rounded-md border border-white/25 bg-white/10 px-3 py-2">Confidentiality acknowledgment and watermark controls enforced</div>
            <div className="rounded-md border border-white/25 bg-white/10 px-3 py-2">Audit-ready write actions across sales, project, finance, and payroll modules</div>
            {mode === "demo" ? (
              <div className="rounded-md border border-emerald-300/55 bg-emerald-300/15 px-3 py-2 text-emerald-100">
                Post-login path: `/workspace?demo=1` for guided lead-to-cash navigation.
              </div>
            ) : null}
          </div>
        </section>

        <section className="card flex flex-col gap-5 md:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{mode === "demo" ? "Demo Sign In" : "Sign In"}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{mode === "demo" ? "Enter demo workspace" : "Welcome back"}</h2>
            </div>
            <Link href="/" className="text-sm font-medium text-accent hover:text-accent-strong">
              Back to story
            </Link>
          </div>

          <p className="text-sm text-muted">
            Use a pre-provisioned account. Self-signup is disabled to protect operational and financial data.
          </p>
          <div className="rounded-lg border border-border bg-muted/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Core Role Shortcuts</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CORE_ROLE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setEmail(preset.email)}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Use {preset.label}
                </button>
              ))}
            </div>
          </div>
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
              {pending ? "Signing in..." : mode === "demo" ? "Start guided demo" : "Access workspace"}
            </button>
          </form>

          <div className="rounded-lg border border-border bg-white px-3 py-3 text-xs text-muted">
            Redirect target after login: <span className="font-medium text-ink">{nextPath}</span>
          </div>
        </section>
      </main>
    </div>
  );
}
