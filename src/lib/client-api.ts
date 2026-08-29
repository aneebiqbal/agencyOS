"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export class ApiClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export async function authFetch(input: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new ApiClientError(error.message, 401);
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new ApiClientError("No active session. Please sign in.", 401);
  }

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(input, {
    ...init,
    headers,
    signal: init.signal ?? timeoutSignal(timeoutMs),
  });

  return response;
}

export async function authJson<T>(input: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<T> {
  const response = await authFetch(input, init, timeoutMs);
  const body = (await response.json().catch(() => ({}))) as { message?: string; data?: T };

  if (!response.ok) {
    throw new ApiClientError(body.message ?? "Request failed.", response.status);
  }

  return (body.data ?? body) as T;
}

export function createIdempotencyKey(prefix: string): string {
  if (typeof window !== "undefined" && typeof window.crypto !== "undefined" && "randomUUID" in window.crypto) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
