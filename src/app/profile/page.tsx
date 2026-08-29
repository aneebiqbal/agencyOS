"use client";

import { useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authJson } from "@/lib/client-api";

interface MePayload {
  userId: string;
  role: "owner" | "hr" | "cto";
  orgId: string;
}

export default function ProfilePage() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const payload = await authJson<MePayload>("/api/me");
          setMe(payload);
          setLoading(false);
        } catch (cause) {
          setError(cause instanceof ApiClientError ? cause.message : "Could not load profile.");
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await authJson("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      setMessage("Profile updated.");
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Profile update failed.");
    }
    setSaving(false);
  }

  return (
    <ModuleShell title="Profile" description="Manage your operator profile and identity details.">
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading profile..." /> : null}
      {message ? <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}

      {me ? (
        <section className="grid gap-3 xl:grid-cols-2">
          <div className="card space-y-2 text-sm">
            <h2 className="text-sm font-semibold text-ink">Identity</h2>
            <p>
              <span className="text-muted">User ID:</span> <span className="font-mono text-xs">{me.userId}</span>
            </p>
            <p>
              <span className="text-muted">Organization:</span> {me.orgId}
            </p>
            <p className="flex items-center gap-2">
              <span className="text-muted">Role:</span> <StatusBadge status={me.role} />
            </p>
          </div>

          <form className="card grid gap-3" onSubmit={saveProfile}>
            <h2 className="text-sm font-semibold text-ink">Display name</h2>
            <label className="field">
              <span className="field-label">Display name</span>
              <input
                className="input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Jane Doe"
              />
            </label>
            <div>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </ModuleShell>
  );
}
