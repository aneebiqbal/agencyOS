import { badRequest } from "@/lib/domain/errors";

export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw badRequest("Money value must be a finite number.");
  }

  if (value >= 0) {
    return Math.floor(value + 0.5);
  }

  return Math.ceil(value - 0.5);
}

export function decimalToCents(amount: number): number {
  return roundHalfUp(amount * 100);
}

export function assertValidCents(cents: number, maxCents: number, fieldName: string): void {
  if (!Number.isInteger(cents)) {
    throw badRequest(`${fieldName} must be stored as integer cents.`);
  }

  if (cents < 0) {
    throw badRequest(`${fieldName} cannot be negative.`);
  }

  if (cents > maxCents) {
    throw badRequest(`${fieldName} exceeds allowed maximum.`);
  }
}
