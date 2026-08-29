"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/client-api";

export function WatermarkOverlay() {
  const [stamp, setStamp] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStamp() {
      try {
        const res = await authFetch("/api/me");
        if (!res.ok) {
          setStamp("");
          return;
        }
        const body = (await res.json()) as { data?: { userId?: string; role?: string } };
        const id = body.data?.userId ?? "unknown";
        const role = body.data?.role ?? "unknown";
        setError(null);
        setStamp(`${id} (${role}) @ ${new Date().toISOString()}`);
      } catch {
        setError("Session unavailable");
        setStamp("");
      }
    }

    void loadStamp();
  }, []);

  if (!stamp) {
    if (error) {
      return null;
    }
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-40 rounded bg-black/45 px-2 py-1 font-mono text-[11px] text-white">
      {stamp}
    </div>
  );
}
