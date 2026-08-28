import { beforeEach, describe, expect, it } from "vitest";

import { POST as createTime } from "@/app/api/time-entries/route";
import { POST } from "@/app/api/invoices/generate/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/invoices/generate", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("generates invoice from valid billable time", async () => {
    const timeRequest = new Request("http://localhost/api/time-entries", {
      method: "POST",
      headers: authHeaders("employee", "employee-1", {
        "content-type": "application/json",
        "idempotency-key": "idem-time-generate-invoice",
      }),
      body: JSON.stringify({
        employeeUserId: "employee-1",
        projectId: "project-test-1",
        hours: 8,
        billable: true,
        description: "Feature delivery",
        workDateUtc: "2026-08-09T12:00:00.000Z",
      }),
    });
    await createTime(timeRequest);

    const invoiceRequest = new Request("http://localhost/api/invoices/generate", {
      method: "POST",
      headers: authHeaders("manager", "manager-1", { "content-type": "application/json" }),
      body: JSON.stringify({
        projectId: "project-test-1",
        dueDateUtc: "2026-09-10T00:00:00.000Z",
        taxRateBps: 800,
      }),
    });

    const response = await POST(invoiceRequest);
    expect(response.status).toBe(201);
  });

  it("rejects invalid invoice request", async () => {
    const request = new Request("http://localhost/api/invoices/generate", {
      method: "POST",
      headers: authHeaders("manager", "manager-1", { "content-type": "application/json" }),
      body: JSON.stringify({ projectId: "project-test-1", dueDateUtc: "bad-date", taxRateBps: 20000 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/invoices/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "project-test-1",
        dueDateUtc: "2026-09-10T00:00:00.000Z",
        taxRateBps: 800,
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
