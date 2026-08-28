import type { DataStore } from "@/lib/db/store";

export interface FinanceSummary {
  periodStartUtc: string;
  periodEndUtc: string;
  revenueInCents: number;
  payrollOutCents: number;
  expenseOutCents: number;
  netMarginCents: number;
}

export function getFinanceSummary(
  store: DataStore,
  periodStartUtc: string,
  periodEndUtc: string,
): FinanceSummary {
  const fromMs = Date.parse(periodStartUtc);
  const toMs = Date.parse(periodEndUtc);

  const invoicesPaid = store
    .getState()
    .invoices.filter((invoice) => invoice.status === "paid" && Date.parse(invoice.issuedAtUtc) >= fromMs && Date.parse(invoice.issuedAtUtc) <= toMs);

  const payrollTotals = store
    .getState()
    .payrollRuns.filter(
      (run) =>
        run.status === "completed" &&
        Date.parse(run.periodStartUtc) >= fromMs &&
        Date.parse(run.periodEndUtc) <= toMs,
    );

  const reimbursedExpenses = store
    .getState()
    .expenses.filter(
      (expense) =>
        expense.status === "reimbursed" &&
        Date.parse(expense.incurredAtUtc) >= fromMs &&
        Date.parse(expense.incurredAtUtc) <= toMs,
    );

  const revenueInCents = invoicesPaid.reduce((sum, item) => sum + item.totalCents, 0);
  const payrollOutCents = payrollTotals.reduce((sum, item) => sum + item.totalCostCents, 0);
  const expenseOutCents = reimbursedExpenses.reduce((sum, item) => sum + item.amountCents, 0);

  return {
    periodStartUtc,
    periodEndUtc,
    revenueInCents,
    payrollOutCents,
    expenseOutCents,
    netMarginCents: revenueInCents - payrollOutCents - expenseOutCents,
  };
}
