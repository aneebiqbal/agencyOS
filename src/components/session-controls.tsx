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
    return <div className="text-sm text-zinc-500">Session: checking...</div>;
  }

  if (!userLabel) {
    return (
      <Link href="/login" className="text-sm font-medium text-accent hover:text-accent-strong">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-slate-700">
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
  );
}
