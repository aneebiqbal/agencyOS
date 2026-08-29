import { ZodError, type ZodSchema } from "zod";

import { DomainError, badRequest } from "@/lib/domain/errors";
import { logError } from "@/lib/logger";

interface MaybePgError {
  code?: string;
  detail?: string;
  constraint?: string;
}

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

  const pgError = error as MaybePgError;
  if (typeof pgError?.code === "string") {
    if (pgError.code === "23503") {
      return jsonResponse(400, {
        ok: false,
        code: "FOREIGN_KEY_VIOLATION",
        message: "Referenced record was not found. Verify selected user/project/staff values.",
      });
    }
    if (pgError.code === "23505") {
      return jsonResponse(409, {
        ok: false,
        code: "UNIQUE_VIOLATION",
        message: "Record already exists or duplicates a unique field.",
      });
    }
    if (pgError.code === "23514") {
      return jsonResponse(400, {
        ok: false,
        code: "CHECK_VIOLATION",
        message: "One of the values is outside allowed limits.",
      });
    }
    if (pgError.code === "22P02") {
      return jsonResponse(400, {
        ok: false,
        code: "INVALID_VALUE",
        message: "One or more values had invalid format.",
      });
    }
    if (pgError.code === "42P01") {
      return jsonResponse(500, {
        ok: false,
        code: "MISSING_TABLE",
        message: "Database schema is behind application version. Run migrations.",
      });
    }
  }

  logError(error, { endpoint, actorUserId });
  return jsonResponse(500, {
    ok: false,
    code: "INTERNAL_ERROR",
    message: "Unexpected server error.",
  });
}
