"use client";

import { useEffect, useState } from "react";
import { getMeCached } from "@/lib/client-me";

export function WatermarkOverlay() {
  const [stamp, setStamp] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStamp() {
      try {
        const me = await getMeCached();
        setError(null);
        setStamp(`${me.userId} (${me.role})`);
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
