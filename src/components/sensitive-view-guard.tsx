"use client";

import { useEffect, useState } from "react";

const REAUTH_MS = 5 * 60 * 1000;

export function SensitiveViewGuard() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const lockTimer = window.setTimeout(() => {
      setLocked(true);
    }, REAUTH_MS);

    const onContext = (event: MouseEvent) => event.preventDefault();
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
      }
    };

    window.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(lockTimer);
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  async function reauthenticate() {
    const token = window.sessionStorage.getItem("agency_access_token");
    if (!token) {
      return;
    }
    const response = await fetch("/api/me", { headers: { authorization: `Bearer ${token}` } });
    if (response.ok) {
      setLocked(false);
      window.setTimeout(() => setLocked(true), REAUTH_MS);
    }
  }

  if (!locked) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 text-white">
      <div className="rounded-xl border border-white/25 bg-zinc-900 p-6 text-center">
        <p className="text-lg font-semibold">Payroll view timed out</p>
        <p className="mt-2 text-sm opacity-90">Re-authentication is required for sensitive views.</p>
        <button
          type="button"
          className="mt-4 rounded bg-teal-600 px-4 py-2 text-sm font-semibold"
          onClick={reauthenticate}
        >
          Re-authenticate view
        </button>
      </div>
    </div>
  );
}
