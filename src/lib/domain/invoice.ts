import { badRequest } from "@/lib/domain/errors";
import { assertValidCents } from "@/lib/domain/money";
import type { InvoiceLineItem } from "@/lib/domain/types";

export interface InvoiceTotals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export function calculateInvoiceTotals(
  lineItems: InvoiceLineItem[],
  taxRateBps: number,
): InvoiceTotals {
  if (lineItems.length === 0) {
    throw badRequest("Invoice must have at least one line item.");
  }

  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) {
    throw badRequest("Tax rate basis points must be between 0 and 10000.");
  }

  let subtotalCents = 0;

  for (const item of lineItems) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw badRequest("Invoice line quantity must be a positive integer.");
    }
    assertValidCents(item.unitAmountCents, 50_000_000, "Line item unit amount");
    assertValidCents(item.lineTotalCents, 500_000_000, "Line item total");

    const expectedLineTotal = item.quantity * item.unitAmountCents;
    if (expectedLineTotal !== item.lineTotalCents) {
      throw badRequest("Invoice line total does not match quantity * unit amount.");
    }

    subtotalCents += item.lineTotalCents;
  }

  const taxCents = Math.floor((subtotalCents * taxRateBps + 5000) / 10000);
  const totalCents = subtotalCents + taxCents;
  return { subtotalCents, taxCents, totalCents };
}
