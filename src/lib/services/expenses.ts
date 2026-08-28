import { randomUUID } from "node:crypto";

import type { DataStore } from "@/lib/db/store";
import { badRequest, conflict, notFound } from "@/lib/domain/errors";
import { assertValidCents } from "@/lib/domain/money";
import type { Expense, SessionUser } from "@/lib/domain/types";

function assertIncurredDateNotFuture(utcIso: string): void {
  const now = Date.now();
  const candidate = Date.parse(utcIso);
  if (Number.isNaN(candidate)) {
    throw badRequest("incurredAtUtc must be a valid UTC ISO timestamp.");
  }
  if (candidate > now) {
    throw badRequest("Future-dated expenses are not allowed.");
  }
}

export function createExpense(
  store: DataStore,
  actor: SessionUser,
  input: Omit<Expense, "id" | "status" | "createdAtUtc" | "deletedAtUtc">,
  idempotencyKey: string,
): Expense {
  assertIncurredDateNotFuture(input.incurredAtUtc);
  assertValidCents(input.amountCents, 5_000_000, "Expense amount");

  const duplicate = store.getState().idempotencyByKey[idempotencyKey];
  if (duplicate) {
    throw conflict("Duplicate submission detected. Reuse returned response for idempotent retry.");
  }

  const now = new Date().toISOString();
  const expense = store.transaction((state) => {
    const employee = state.employees.find((item) => item.userId === input.employeeUserId);
    if (!employee) {
      throw notFound("Employee not found.");
    }
    const approver = state.employees.find((item) => item.userId === input.approverUserId);
    if (!approver) {
      throw notFound("Approver not found.");
    }

    const created: Expense = {
      id: randomUUID(),
      employeeUserId: input.employeeUserId,
      category: input.category,
      amountCents: input.amountCents,
      approverUserId: input.approverUserId,
      receiptUrl: input.receiptUrl,
      status: "submitted",
      incurredAtUtc: input.incurredAtUtc,
      createdAtUtc: now,
      deletedAtUtc: null,
    };
    state.expenses.push(created);
    return created;
  });

  store.transaction((state) => {
    state.idempotencyByKey[idempotencyKey] = {
      status: 201,
      body: {
        ok: true,
        data: expense,
      },
    };
  });

  store.appendAuditLog(actor, "expense.create", "expense", expense.id, null, expense);
  return expense;
}
