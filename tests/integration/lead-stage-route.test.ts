import { beforeEach, describe, expect, it } from "vitest";

import { PATCH } from "@/app/api/leads/[leadId]/stage/route";
import { authHeaders, readJson, setupFreshState } from "../helpers";

describe("/api/leads/:leadId/stage", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("updates lead stage for valid transition", async () => {
    const request = new Request("http://localhost/api/leads/lead-test-1/stage", {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ stage: "lost" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ leadId: "lead-test-1" }) });
    const body = await readJson(response);
    const data = body.data as { stage: string };

    expect(response.status).toBe(200);
    expect(data.stage).toBe("lost");
  });

  it("blocks won transition from stage endpoint", async () => {
    const request = new Request("http://localhost/api/leads/lead-test-1/stage", {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ stage: "won" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ leadId: "lead-test-1" }) });
    expect(response.status).toBe(409);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/leads/lead-test-1/stage", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "lost" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ leadId: "lead-test-1" }) });
    expect(response.status).toBe(401);
  });
});
