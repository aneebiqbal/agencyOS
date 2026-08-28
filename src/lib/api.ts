import { ZodError, type ZodSchema } from "zod";

import { DomainError, badRequest } from "@/lib/domain/errors";
import { logError } from "@/lib/logger";

export function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

export async function parseRequestBody<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<T> {
  let parsedJson: unknown;
  try {
    parsedJson = await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  return schema.parse(parsedJson);
}

export function parseQuery<T>(url: URL, schema: ZodSchema<T>): T {
  const queryObject = Object.fromEntries(url.searchParams.entries());
  return schema.parse(queryObject);
}

export function handleApiError(error: unknown, endpoint: string, actorUserId?: string): Response {
  if (error instanceof DomainError) {
    return jsonResponse(error.statusCode, {
      ok: false,
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof ZodError) {
    return jsonResponse(400, {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Invalid request payload.",
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  logError(error, { endpoint, actorUserId });
  return jsonResponse(500, {
    ok: false,
    code: "INTERNAL_ERROR",
    message: "Unexpected server error.",
  });
}
