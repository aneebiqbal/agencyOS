import { beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/finance/summary/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/finance/summary", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("returns finance summary for core role", async () => {
    const request = new Request(
      "http://localhost/api/finance/summary?fromUtc=2026-08-01T00:00:00.000Z&toUtc=2026-08-31T23:59:59.999Z",
      {
        method: "GET",
        headers: await authHeaders("hr", "hr-1"),
      },
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it("rejects invalid date range", async () => {
    const request = new Request(
      "http://localhost/api/finance/summary?fromUtc=2026-09-01T00:00:00.000Z&toUtc=2026-08-01T00:00:00.000Z",
      {
        method: "GET",
        headers: await authHeaders("hr", "hr-1"),
      },
    );
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request(
      "http://localhost/api/finance/summary?fromUtc=2026-08-01T00:00:00.000Z&toUtc=2026-08-31T23:59:59.999Z",
      { method: "GET" },
    );
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
