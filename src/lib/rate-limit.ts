import { tooManyRequests } from "@/lib/domain/errors";

interface Bucket {
  count: number;
  windowStartMs: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const LIMIT_PER_WINDOW = 60;

export function assertWithinRateLimit(actorKey: string): void {
  const now = Date.now();
  const bucket = buckets.get(actorKey);

  if (!bucket || now - bucket.windowStartMs > WINDOW_MS) {
    buckets.set(actorKey, { count: 1, windowStartMs: now });
    return;
  }

  if (bucket.count >= LIMIT_PER_WINDOW) {
    throw tooManyRequests("Rate limit exceeded for write operations.");
  }

  bucket.count += 1;
}

export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
}
