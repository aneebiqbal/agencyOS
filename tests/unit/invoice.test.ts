import { describe, expect, it } from "vitest";

import { calculateInvoiceTotals } from "@/lib/domain/invoice";

describe("calculateInvoiceTotals", () => {
  it("calculates totals with explicit half-up rounding", () => {
    const totals = calculateInvoiceTotals(
      [{ description: "Design", quantity: 100, unitAmountCents: 75, lineTotalCents: 7500 }],
      875,
    );

    expect(totals).toEqual({
      subtotalCents: 7500,
      taxCents: 656,
      totalCents: 8156,
    });
  });

  it("rejects empty line items", () => {
    expect(() => calculateInvoiceTotals([], 0)).toThrow("at least one line item");
  });

  it("rejects invalid line totals", () => {
    expect(() =>
      calculateInvoiceTotals(
        [{ description: "Dev", quantity: 2, unitAmountCents: 5000, lineTotalCents: 9999 }],
        0,
      ),
    ).toThrow("does not match");
  });
});
