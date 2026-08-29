"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearActiveOrgId, setActiveOrgId } from "@/lib/client-org";
import { clearMeCache, getMeCached } from "@/lib/client-me";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function SessionControls() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [orgOptions, setOrgOptions] = useState<string[]>([]);

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
        setUserLabel(`${me.userId} (${me.role}) @ ${me.orgId}`);
        setActiveOrgIdState(me.orgId);
        setOrgOptions(me.availableOrgIds ?? [me.orgId]);
        setActiveOrgId(me.orgId);
      } catch {
        setUserLabel(null);
        setActiveOrgIdState(null);
        setOrgOptions([]);
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
    clearActiveOrgId();
    clearMeCache();
    setUserLabel(null);
    setActiveOrgIdState(null);
    setOrgOptions([]);
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
        {orgOptions.length > 1 ? (
          <label className="inline-flex items-center gap-1 text-xs text-muted">
            Org
            <select
              value={activeOrgId ?? ""}
              onChange={(event) => {
                const nextOrgId = event.target.value;
                setActiveOrgId(nextOrgId);
                setActiveOrgIdState(nextOrgId);
                clearMeCache();
                router.refresh();
              }}
              className="rounded-md border border-border bg-white px-2 py-1 text-xs text-ink"
            >
              {orgOptions.map((orgId) => (
                <option key={orgId} value={orgId}>
                  {orgId}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
