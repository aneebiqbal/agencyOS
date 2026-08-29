"use client";

import { authJson } from "@/lib/client-api";

export interface MePayload {
  userId: string;
  role: "owner" | "hr" | "cto";
  orgId: string;
  availableOrgIds?: string[];
}

const ME_CACHE_TTL_MS = 30_000;

let cachedMe: MePayload | null = null;
let cachedAtMs = 0;
let inFlight: Promise<MePayload> | null = null;

export async function getMeCached(force = false): Promise<MePayload> {
  const now = Date.now();
  if (!force && cachedMe && now - cachedAtMs < ME_CACHE_TTL_MS) {
    return cachedMe;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = authJson<MePayload>("/api/me").then((me) => {
    cachedMe = me;
    cachedAtMs = Date.now();
    return me;
  });

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function clearMeCache(): void {
  cachedMe = null;
  cachedAtMs = 0;
  inFlight = null;
}
