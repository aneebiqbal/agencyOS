import { badRequest } from "@/lib/domain/errors";

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (!key || key.trim().length < 8) {
    throw badRequest("idempotency-key header is required and must be at least 8 characters.");
  }
  return key.trim();
}
