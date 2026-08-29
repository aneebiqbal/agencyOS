"use client";

import { useEffect, useState } from "react";

export function WatermarkOverlay() {
  const [stamp, setStamp] = useState<string>("");

  useEffect(() => {
    async function loadStamp() {
      const token = window.sessionStorage.getItem("agency_access_token");
      if (!token) {
        return;
      }

      try {
        const res = await fetch("/api/me", { headers: { authorization: `Bearer ${token}` } });
        const body = (await res.json()) as { data?: { userId?: string; role?: string } };
        const id = body.data?.userId ?? "unknown";
        const role = body.data?.role ?? "unknown";
        setStamp(`${id} (${role}) @ ${new Date().toISOString()}`);
      } catch {
        setStamp(`unknown @ ${new Date().toISOString()}`);
      }
    }

    void loadStamp();
  }, []);

  if (!stamp) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-40 rounded bg-black/45 px-2 py-1 font-mono text-[11px] text-white">
      {stamp}
    </div>
  );
}
