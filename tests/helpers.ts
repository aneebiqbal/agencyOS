import { resetRateLimitBucketsForTests } from "@/lib/rate-limit";
import { resetPersistenceForTests } from "@/lib/persistence";

export function authHeaders(role = "owner", userId = "owner-1", extras?: HeadersInit): Headers {
  const headers = new Headers(extras);
  headers.set("x-user-id", userId);
  headers.set("x-user-role", role);
  return headers;
}

export async function setupFreshState(): Promise<void> {
  await resetPersistenceForTests();
  resetRateLimitBucketsForTests();
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}
