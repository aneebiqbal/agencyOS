"use client";

import { useEffect, useState } from "react";
import { ApiClientError, authFetch } from "@/lib/client-api";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface StatusPayload {
  needsAcknowledgement: boolean;
  noticeVersion: string | null;
  noticeText?: string;
}

export function ConfidentialityGate() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function loadStatus(): Promise<void> {
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setError(sessionError.message);
      setLoading(false);
      return;
    }

    const sessionToken = data.session?.access_token ?? null;
    if (!sessionToken) {
      setToken(null);
      setStatus(null);
      setLoading(false);
      return;
    }

    setToken(sessionToken);

    try {
      const response = await authFetch("/api/confidentiality/status", { method: "GET" }, 10_000);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "Unable to load confidentiality status.");
        setLoading(false);
        return;
      }
      const body = (await response.json()) as { data: StatusPayload };
      setStatus(body.data);
      setLoading(false);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        setError("Please sign in to continue.");
      } else {
        setError("Confidentiality status request timed out or failed. Retry.");
      }
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStatus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  async function acknowledge() {
    if (!token || !status?.noticeVersion || !checked) {
      return;
    }

    try {
      const response = await authFetch(
        "/api/confidentiality/acknowledge",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ version: status.noticeVersion, acknowledged: true }),
        },
        10_000,
      );
      if (response.ok) {
        setStatus({ ...status, needsAcknowledgement: false });
        return;
      }
      setError("Acknowledgement failed. Please retry.");
    } catch {
      setError("Acknowledgement request timed out. Please retry.");
    }
  }

  if (loading) {
    return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 text-white">Loading...</div>;
  }

  if (!token) {
    return null;
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 text-center text-white">
        <div>
          <p className="text-lg font-semibold">Access blocked</p>
          <p className="mt-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => {
              void loadStatus();
            }}
            className="mt-4 rounded-md border border-white/40 px-4 py-2 text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!status?.needsAcknowledgement) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-6 text-white">
      <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-white/30 bg-zinc-950 p-6">
        <h2 className="text-xl font-semibold">Confidentiality acknowledgement required</h2>
        <p className="mt-3 text-sm leading-6 opacity-90">{status.noticeText}</p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          I acknowledge and agree to follow these confidentiality requirements.
        </label>
        <button
          type="button"
          className="mt-4 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          onClick={acknowledge}
          disabled={!checked}
        >
          I acknowledge
        </button>
      </div>
    </div>
  );
}
