"use client";

import { useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authJson } from "@/lib/client-api";
import { getMeCached } from "@/lib/client-me";

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
          const payload = await getMeCached();
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
    const nextDisplayName = displayName.trim();
    if (!nextDisplayName) {
      setMessage("Enter a display name to update your profile.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await authJson("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: nextDisplayName }),
      });
      setMessage("Profile updated.");
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Profile update failed.");
    }
    setSaving(false);
  }

  return (
    <ModuleShell
      title="Profile & Identity"
      description="Keep your operator identity current for audit clarity, approvals, and cross-team accountability."
    >
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading profile..." /> : null}
      {message ? <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}

      {me ? (
        <section className="grid gap-3 xl:grid-cols-2">
          <div className="card space-y-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Account Context</p>
              <h2 className="mt-1 text-base font-semibold text-ink">Current operator identity</h2>
            </div>
            <div className="card-muted space-y-2">
              <p>
                <span className="text-muted">User ID:</span> <span className="font-mono text-xs text-ink">{me.userId}</span>
              </p>
              <p>
                <span className="text-muted">Organization:</span> <span className="num text-ink">{me.orgId}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="text-muted">Role:</span> <StatusBadge status={me.role} />
              </p>
            </div>
            <p className="text-xs leading-5 text-muted">
              This identity is attached to write actions in operational modules. Keep profile details accurate for reliable audit traceability.
            </p>
          </div>

          <form className="card grid gap-3" onSubmit={saveProfile}>
            <div>
              <h2 className="text-sm font-semibold text-ink">Public display name</h2>
              <p className="mt-1 text-xs text-muted">Shown in collaboration and approval views when available.</p>
            </div>
            <label className="field">
              <span className="field-label">Display name</span>
              <input
                className="input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Jane Doe"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">Display name is required when saving this form.</p>
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
