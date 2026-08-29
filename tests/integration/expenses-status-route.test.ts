import { beforeEach, describe, expect, it } from "vitest";

import { POST as CREATE_EXPENSE } from "@/app/api/expenses/route";
import { PATCH as UPDATE_EXPENSE_STATUS } from "@/app/api/expenses/[expenseId]/status/route";
import { authHeaders, readJson, setupFreshState } from "../helpers";

async function createExpenseForStatusFlow() {
  const createRequest = new Request("http://localhost/api/expenses", {
    method: "POST",
    headers: await authHeaders("hr", "hr-1", {
      "content-type": "application/json",
      "idempotency-key": "idem-exp-status-1",
    }),
    body: JSON.stringify({
      employeeUserId: "owner-1",
      category: "software",
      amountCents: 1299,
      approverUserId: "owner-1",
      receiptUrl: "https://example.com/receipt-status",
      incurredAtUtc: "2026-08-10T12:00:00.000Z",
    }),
  });

  const createResponse = await CREATE_EXPENSE(createRequest);
  const createBody = await readJson(createResponse);
  const expense = createBody.data as { id: string };
  return { createResponse, expenseId: expense.id };
}

describe("/api/expenses/:expenseId/status", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("moves submitted expense to approved", async () => {
    const { expenseId } = await createExpenseForStatusFlow();
    const request = new Request(`http://localhost/api/expenses/${expenseId}/status`, {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ status: "approved" }),
    });

    const response = await UPDATE_EXPENSE_STATUS(request, { params: Promise.resolve({ expenseId }) });
    const body = await readJson(response);
    const updated = body.data as { status: string };

    expect(response.status).toBe(200);
    expect(updated.status).toBe("approved");
  });

  it("moves approved expense to reimbursed", async () => {
    const { expenseId } = await createExpenseForStatusFlow();

    const approveRequest = new Request(`http://localhost/api/expenses/${expenseId}/status`, {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ status: "approved" }),
    });
    await UPDATE_EXPENSE_STATUS(approveRequest, { params: Promise.resolve({ expenseId }) });

    const reimburseRequest = new Request(`http://localhost/api/expenses/${expenseId}/status`, {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ status: "reimbursed" }),
    });
    const reimburseResponse = await UPDATE_EXPENSE_STATUS(reimburseRequest, { params: Promise.resolve({ expenseId }) });
    const body = await readJson(reimburseResponse);
    const updated = body.data as { status: string };

    expect(reimburseResponse.status).toBe(200);
    expect(updated.status).toBe("reimbursed");
  });

  it("rejects invalid status payload", async () => {
    const { expenseId } = await createExpenseForStatusFlow();
    const request = new Request(`http://localhost/api/expenses/${expenseId}/status`, {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ status: "invalid" }),
    });

    const response = await UPDATE_EXPENSE_STATUS(request, { params: Promise.resolve({ expenseId }) });
    expect(response.status).toBe(400);
  });

  it("returns not found for unknown expense", async () => {
    const request = new Request("http://localhost/api/expenses/missing/status", {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ status: "approved" }),
    });

    const response = await UPDATE_EXPENSE_STATUS(request, { params: Promise.resolve({ expenseId: "missing" }) });
    expect(response.status).toBe(404);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/expenses/missing/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });

    const response = await UPDATE_EXPENSE_STATUS(request, { params: Promise.resolve({ expenseId: "missing" }) });
    expect(response.status).toBe(401);
  });
});
