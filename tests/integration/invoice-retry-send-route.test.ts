import { beforeEach, describe, expect, it } from "vitest";

import { POST as WIN_DEAL } from "@/app/api/deals/[dealId]/win/route";
import { POST as CREATE_TIME } from "@/app/api/time-entries/route";
import { POST as GENERATE_INVOICE } from "@/app/api/invoices/generate/route";
import { POST as RETRY_SEND } from "@/app/api/invoices/[invoiceId]/retry-send/route";
import { authHeaders, readJson, setupFreshState } from "../helpers";

async function createFailedInvoiceId() {
  const winRequest = new Request("http://localhost/api/deals/deal-test-1/win", {
    method: "POST",
    headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
    body: JSON.stringify({ clientName: "Fail-send Industries", managerUserId: "cto-1" }),
  });
  const winResponse = await WIN_DEAL(winRequest, { params: Promise.resolve({ dealId: "deal-test-1" }) });
  const winBody = await readJson(winResponse);
  const project = winBody.data as { project: { id: string } };

  const timeRequest = new Request("http://localhost/api/time-entries", {
    method: "POST",
    headers: await authHeaders("hr", "hr-1", {
      "content-type": "application/json",
      "idempotency-key": "idem-retry-send-time",
    }),
    body: JSON.stringify({
      employeeUserId: "owner-1",
      projectId: project.project.id,
      hours: 2,
      billable: true,
      description: "Retry send scenario",
      workDateUtc: "2026-08-11T12:00:00.000Z",
    }),
  });
  const timeResponse = await CREATE_TIME(timeRequest);
  expect(timeResponse.status).toBe(201);

  const invoiceRequest = new Request("http://localhost/api/invoices/generate", {
    method: "POST",
    headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
    body: JSON.stringify({
      projectId: project.project.id,
      dueDateUtc: "2026-09-15T00:00:00.000Z",
      taxRateBps: 800,
    }),
  });
  const invoiceResponse = await GENERATE_INVOICE(invoiceRequest);
  const invoiceBody = await readJson(invoiceResponse);
  const invoice = invoiceBody.data as { invoice: { id: string; status: string } };

  expect(invoiceResponse.status).toBe(201);
  expect(invoice.invoice.status).toBe("send_failed");

  return invoice.invoice.id;
}

async function createSentInvoiceId() {
  const timeRequest = new Request("http://localhost/api/time-entries", {
    method: "POST",
    headers: await authHeaders("hr", "hr-1", {
      "content-type": "application/json",
      "idempotency-key": "idem-retry-send-time-sent",
    }),
    body: JSON.stringify({
      employeeUserId: "owner-1",
      projectId: "project-test-1",
      hours: 2,
      billable: true,
      description: "Retry send non-failed scenario",
      workDateUtc: "2026-08-11T12:00:00.000Z",
    }),
  });
  const timeResponse = await CREATE_TIME(timeRequest);
  expect(timeResponse.status).toBe(201);

  const invoiceRequest = new Request("http://localhost/api/invoices/generate", {
    method: "POST",
    headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
    body: JSON.stringify({
      projectId: "project-test-1",
      dueDateUtc: "2026-09-15T00:00:00.000Z",
      taxRateBps: 800,
    }),
  });
  const invoiceResponse = await GENERATE_INVOICE(invoiceRequest);
  const invoiceBody = await readJson(invoiceResponse);
  const invoice = invoiceBody.data as { invoice: { id: string; status: string } };

  expect(invoiceResponse.status).toBe(201);
  expect(invoice.invoice.status).toBe("sent");

  return invoice.invoice.id;
}

describe("/api/invoices/:invoiceId/retry-send", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("retries send for failed invoice", async () => {
    const invoiceId = await createFailedInvoiceId();

    const request = new Request(`http://localhost/api/invoices/${invoiceId}/retry-send`, {
      method: "POST",
      headers: await authHeaders("owner", "owner-1"),
    });

    const response = await RETRY_SEND(request, { params: Promise.resolve({ invoiceId }) });
    const body = await readJson(response);
    const invoice = body.data as { status: string };

    expect(response.status).toBe(200);
    expect(invoice.status).toBe("sent");
  });

  it("rejects retry for unknown invoice", async () => {
    const response = await RETRY_SEND(
      new Request("http://localhost/api/invoices/missing/retry-send", {
        method: "POST",
        headers: await authHeaders("owner", "owner-1"),
      }),
      { params: Promise.resolve({ invoiceId: "missing" }) },
    );
    expect(response.status).toBe(404);
  });

  it("rejects retry when status is not send_failed", async () => {
    const invoiceId = await createSentInvoiceId();
    const response = await RETRY_SEND(
      new Request(`http://localhost/api/invoices/${invoiceId}/retry-send`, {
        method: "POST",
        headers: await authHeaders("owner", "owner-1"),
      }),
      { params: Promise.resolve({ invoiceId }) },
    );
    expect(response.status).toBe(400);
  });

  it("rejects unauthorized request", async () => {
    const response = await RETRY_SEND(
      new Request("http://localhost/api/invoices/missing/retry-send", {
        method: "POST",
      }),
      { params: Promise.resolve({ invoiceId: "missing" }) },
    );
    expect(response.status).toBe(401);
  });
});
