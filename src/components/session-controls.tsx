"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface MePayload {
  data?: {
    userId?: string;
    role?: string;
  };
}

export function SessionControls() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userLabel, setUserLabel] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const token = window.sessionStorage.getItem("agency_access_token");
      if (!token) {
        setLoading(false);
        setUserLabel(null);
        return;
      }

      try {
        const response = await fetch("/api/me", { headers: { authorization: `Bearer ${token}` } });
        if (!response.ok) {
          window.sessionStorage.removeItem("agency_access_token");
          window.sessionStorage.removeItem("agency_refresh_token");
          setUserLabel(null);
          setLoading(false);
          return;
        }
        const body = (await response.json()) as MePayload;
        const userId = body.data?.userId ?? "unknown";
        const role = body.data?.role ?? "unknown";
        setUserLabel(`${userId} (${role})`);
      } catch {
        setUserLabel(null);
      }

      setLoading(false);
    }

    void load();
  }, []);

  async function signOut() {
    const token = window.sessionStorage.getItem("agency_access_token");
    if (token) {
      try {
        await fetch("/api/auth/signout", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
      } catch {
        // no-op
      }
    }

    window.sessionStorage.removeItem("agency_access_token");
    window.sessionStorage.removeItem("agency_refresh_token");
    setUserLabel(null);
    router.push("/login");
    router.refresh();
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
      <span className="rounded-full border border-border bg-surface-soft px-3 py-1 text-xs font-medium text-zinc-700">
        {userLabel}
      </span>
      <button type="button" onClick={signOut} className="text-sm font-medium text-accent hover:text-accent-strong">
        Sign out
      </button>
    </div>
  );
}
