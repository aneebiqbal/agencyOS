import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/expenses/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/expenses", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("creates a valid expense", async () => {
    const request = new Request("http://localhost/api/expenses", {
      method: "POST",
      headers: await authHeaders("hr", "hr-1", {
        "content-type": "application/json",
        "idempotency-key": "idem-exp-1",
      }),
      body: JSON.stringify({
        employeeUserId: "owner-1",
        category: "software",
        amountCents: 1299,
        approverUserId: "cto-1",
        receiptUrl: "https://example.com/receipt-1",
        incurredAtUtc: "2026-08-10T12:00:00.000Z",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it("rejects invalid payload", async () => {
    const request = new Request("http://localhost/api/expenses", {
      method: "POST",
      headers: await authHeaders("hr", "hr-1", {
        "content-type": "application/json",
        "idempotency-key": "idem-exp-2",
      }),
      body: JSON.stringify({
        employeeUserId: "owner-1",
        category: "software",
        amountCents: -30,
        approverUserId: "cto-1",
        receiptUrl: "not-a-url",
        incurredAtUtc: "2026-08-10T12:00:00.000Z",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/expenses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "idem-exp-3",
      },
      body: JSON.stringify({
        employeeUserId: "owner-1",
        category: "software",
        amountCents: 50,
        approverUserId: "cto-1",
        receiptUrl: "https://example.com/receipt-3",
        incurredAtUtc: "2026-08-10T12:00:00.000Z",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
