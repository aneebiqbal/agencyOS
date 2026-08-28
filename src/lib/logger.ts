export interface LogContext {
  endpoint: string;
  actorUserId?: string;
  details?: Record<string, unknown>;
}

export function logError(error: unknown, context: LogContext): void {
  const payload = {
    level: "error",
    message: error instanceof Error ? error.message : "Unknown error",
    stack: error instanceof Error ? error.stack : undefined,
    endpoint: context.endpoint,
    actorUserId: context.actorUserId,
    details: context.details,
    timestampUtc: new Date().toISOString(),
  };

  // Intentionally structured JSON for machine parsing in production log pipelines.
  console.error(JSON.stringify(payload));
}
