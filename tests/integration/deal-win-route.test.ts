import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/deals/[dealId]/win/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/deals/:dealId/win", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("marks deal won and creates project atomically", async () => {
    const request = new Request("http://localhost/api/deals/deal-test-1/win", {
      method: "POST",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ clientName: "Acme Corp", managerUserId: "cto-1" }),
    });

    const response = await POST(request, { params: Promise.resolve({ dealId: "deal-test-1" }) });
    expect(response.status).toBe(200);
  });

  it("rejects invalid input", async () => {
    const request = new Request("http://localhost/api/deals/deal-test-1/win", {
      method: "POST",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ clientName: "", managerUserId: "" }),
    });

    const response = await POST(request, { params: Promise.resolve({ dealId: "deal-test-1" }) });
    expect(response.status).toBe(400);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/deals/deal-test-1/win", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientName: "Acme Corp", managerUserId: "cto-1" }),
    });

    const response = await POST(request, { params: Promise.resolve({ dealId: "deal-test-1" }) });
    expect(response.status).toBe(401);
  });
});
