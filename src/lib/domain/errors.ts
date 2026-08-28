export class DomainError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function badRequest(message: string): DomainError {
  return new DomainError("BAD_REQUEST", message, 400);
}

export function unauthorized(message = "Authentication required."): DomainError {
  return new DomainError("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "Access denied."): DomainError {
  return new DomainError("FORBIDDEN", message, 403);
}

export function notFound(message: string): DomainError {
  return new DomainError("NOT_FOUND", message, 404);
}

export function conflict(message: string): DomainError {
  return new DomainError("CONFLICT", message, 409);
}

export function tooManyRequests(message: string): DomainError {
  return new DomainError("TOO_MANY_REQUESTS", message, 429);
}
