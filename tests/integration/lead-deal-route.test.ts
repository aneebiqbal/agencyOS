import { beforeEach, describe, expect, it } from "vitest";

import { POST as CREATE_LEAD } from "@/app/api/leads/route";
import { POST as CREATE_DEAL_FOR_LEAD } from "@/app/api/leads/[leadId]/deal/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/leads/:leadId/deal", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("rejects duplicate deal creation for newly created lead", async () => {
    const leadRequest = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({
        source: "referral",
        stage: "new",
        valueEstimateCents: 220_000,
        ownerUserId: "owner-1",
      }),
    });
    const leadResponse = await CREATE_LEAD(leadRequest);
    const leadBody = (await leadResponse.json()) as { data: { id: string } };
    const leadId = leadBody.data.id;

    const firstCreateResponse = await CREATE_DEAL_FOR_LEAD(
      new Request(`http://localhost/api/leads/${leadId}/deal`, {
        method: "POST",
        headers: await authHeaders("owner", "owner-1"),
      }),
      { params: Promise.resolve({ leadId }) },
    );

    expect(firstCreateResponse.status).toBe(409);
  });

  it("returns not found for unknown lead", async () => {
    const response = await CREATE_DEAL_FOR_LEAD(
      new Request("http://localhost/api/leads/missing/deal", {
        method: "POST",
        headers: await authHeaders("owner", "owner-1"),
      }),
      { params: Promise.resolve({ leadId: "missing" }) },
    );

    expect(response.status).toBe(404);
  });

  it("rejects unauthorized request", async () => {
    const response = await CREATE_DEAL_FOR_LEAD(
      new Request("http://localhost/api/leads/lead-test-1/deal", {
        method: "POST",
      }),
      { params: Promise.resolve({ leadId: "lead-test-1" }) },
    );

    expect(response.status).toBe(401);
  });

  it("rejects creating duplicate deal for seeded lead", async () => {
    const response = await CREATE_DEAL_FOR_LEAD(
      new Request("http://localhost/api/leads/lead-test-1/deal", {
        method: "POST",
        headers: await authHeaders("owner", "owner-1"),
      }),
      { params: Promise.resolve({ leadId: "lead-test-1" }) },
    );

    expect(response.status).toBe(409);
  });
});
