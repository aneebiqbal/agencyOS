import { beforeEach, describe, expect, it } from "vitest";

import { POST as CREATE_TIME } from "@/app/api/time-entries/route";
import { POST as GENERATE_INVOICE } from "@/app/api/invoices/generate/route";
import { PATCH } from "@/app/api/invoices/[invoiceId]/status/route";
import { authHeaders, readJson, setupFreshState } from "../helpers";

describe("/api/invoices/:invoiceId/status", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("marks sent invoice as paid", async () => {
    const timeRequest = new Request("http://localhost/api/time-entries", {
      method: "POST",
      headers: await authHeaders("hr", "hr-1", {
        "content-type": "application/json",
        "idempotency-key": "idem-invoice-status-time",
      }),
      body: JSON.stringify({
        employeeUserId: "owner-1",
        projectId: "project-test-1",
        hours: 6,
        billable: true,
        description: "Invoice status flow",
        workDateUtc: "2026-08-09T12:00:00.000Z",
      }),
    });
    const timeResponse = await CREATE_TIME(timeRequest);
    expect(timeResponse.status).toBe(201);

    const generateRequest = new Request("http://localhost/api/invoices/generate", {
      method: "POST",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({
        projectId: "project-test-1",
        dueDateUtc: "2026-09-15T00:00:00.000Z",
        taxRateBps: 800,
      }),
    });

    const generatedResponse = await GENERATE_INVOICE(generateRequest);
    const generatedBody = await readJson(generatedResponse);
    const generated = generatedBody.data as { invoice: { id: string; status: string } };
    const invoice = generated.invoice;

    expect(generatedResponse.status).toBe(201);
    expect(invoice.status).toBe("sent");

    const updateRequest = new Request(`http://localhost/api/invoices/${invoice.id}/status`, {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ status: "paid" }),
    });
    const updateResponse = await PATCH(updateRequest, { params: Promise.resolve({ invoiceId: invoice.id }) });
    const updatedBody = await readJson(updateResponse);
    const updated = updatedBody.data as { status: string };

    expect(updateResponse.status).toBe(200);
    expect(updated.status).toBe("paid");
  });

  it("rejects marking non-sent invoice as paid", async () => {
    const updateRequest = new Request("http://localhost/api/invoices/invoice-missing/status", {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ status: "paid" }),
    });
    const updateResponse = await PATCH(updateRequest, { params: Promise.resolve({ invoiceId: "invoice-missing" }) });
    expect(updateResponse.status).toBe(404);
  });

  it("rejects unauthorized request", async () => {
    const updateRequest = new Request("http://localhost/api/invoices/invoice-test-1/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    });
    const updateResponse = await PATCH(updateRequest, { params: Promise.resolve({ invoiceId: "invoice-test-1" }) });
    expect(updateResponse.status).toBe(401);
  });
});
