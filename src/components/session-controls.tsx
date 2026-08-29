"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearMeCache, getMeCached } from "@/lib/client-me";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function SessionControls() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [userLabel, setUserLabel] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function load() {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setLoading(false);
        setUserLabel(null);
        return;
      }

      try {
        const me = await getMeCached();
        setUserLabel(`${me.userId} (${me.role})`);
      } catch {
        setUserLabel(null);
      }

      setLoading(false);
    }

    void load();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    const supabase = getSupabaseBrowserClient();
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        await fetch("/api/auth/signout", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // no-op
    }

    await supabase.auth.signOut();
    clearMeCache();
    setUserLabel(null);
    router.push("/login");
    router.refresh();
    setSigningOut(false);
  }

  if (loading) {
    return (
      <div className="surface-status w-full md:w-auto" role="status" aria-live="polite" aria-busy="true">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Session</p>
        <p className="mt-1 text-sm font-medium text-ink">Checking authentication...</p>
      </div>
    );
  }

  if (!userLabel) {
    return (
      <div className="surface-status w-full md:w-auto">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Session</p>
        <div className="mt-2">
          <Link href="/login" className="btn inline-flex items-center">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-status w-full md:w-auto">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Active Session</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="status-badge status-info text-[11px]">
          {userLabel}
        </span>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="btn-secondary"
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </div>
  );
}
