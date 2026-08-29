"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    async function loadStatus() {
      const sessionToken = window.sessionStorage.getItem("agency_access_token");
      if (!sessionToken) {
        setLoading(false);
        return;
      }

      setToken(sessionToken);

      try {
        const response = await fetch("/api/confidentiality/status", {
          headers: { authorization: `Bearer ${sessionToken}` },
        });
        const body = (await response.json()) as { data: StatusPayload };
        setStatus(body.data);
        setLoading(false);
      } catch {
        setError("Unable to load confidentiality status.");
        setLoading(false);
      }
    }

    void loadStatus();
  }, []);

  async function acknowledge() {
    if (!token || !status?.noticeVersion || !checked) {
      return;
    }
    const response = await fetch("/api/confidentiality/acknowledge", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ version: status.noticeVersion, acknowledged: true }),
    });
    if (response.ok) {
      setStatus({ ...status, needsAcknowledgement: false });
      return;
    }
    setError("Acknowledgement failed. Please retry.");
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
