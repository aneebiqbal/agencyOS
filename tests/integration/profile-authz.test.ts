import { beforeEach, describe, expect, it } from "vitest";

import { PATCH as updateProfile } from "@/app/api/profile/route";
import { GET as financeSummary } from "@/app/api/finance/summary/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("profile and finance authorization", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("rejects role change through self profile update", async () => {
    const request = new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: await authHeaders("hr", "hr-1", { "content-type": "application/json" }),
      body: JSON.stringify({ role: "owner", displayName: "Try escalate" }),
    });

    const response = await updateProfile(request);
    expect(response.status).toBe(403);
  });

  it("rejects finance summary access for unprovisioned user", async () => {
    const request = new Request(
      "http://localhost/api/finance/summary?fromUtc=2026-08-01T00:00:00.000Z&toUtc=2026-08-31T23:59:59.999Z",
      {
        method: "GET",
        headers: await authHeaders("unknown", "unknown-user"),
      },
    );

    const response = await financeSummary(request);
    expect(response.status).toBe(403);
  });

  it("ignores token role claim and uses employees-table role", async () => {
    const request = new Request(
      "http://localhost/api/finance/summary?fromUtc=2026-08-01T00:00:00.000Z&toUtc=2026-08-31T23:59:59.999Z",
      {
        method: "GET",
        headers: await authHeaders("owner", "hr-1"),
      },
    );

    const response = await financeSummary(request);
    expect(response.status).toBe(200);
  });
});
