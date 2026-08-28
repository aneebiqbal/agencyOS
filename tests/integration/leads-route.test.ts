import { beforeEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/leads/route";
import { authHeaders, readJson, setupFreshState } from "../helpers";

describe("/api/leads", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("accepts valid lead creation", async () => {
    const request = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({
        source: "referral",
        stage: "new",
        valueEstimateCents: 100_000,
        ownerUserId: "owner-1",
      }),
    });

    const response = await POST(request);
    const body = await readJson(response);

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
  });

  it("rejects invalid lead payload", async () => {
    const request = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ source: "bad-source" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/leads", { method: "GET" });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
