import { beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/performance/snapshots/route";
import { authHeaders, readJson, setupFreshState } from "../helpers";

describe("/api/performance/snapshots", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("returns actor-scoped metrics", async () => {
    const request = new Request("http://localhost/api/performance/snapshots", {
      method: "GET",
      headers: authHeaders("employee", "employee-1"),
    });
    const response = await GET(request);
    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("handles malformed auth role as invalid input", async () => {
    const request = new Request("http://localhost/api/performance/snapshots", {
      method: "GET",
      headers: {
        "x-user-id": "employee-1",
        "x-user-role": "invalid-role",
      },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/performance/snapshots", { method: "GET" });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
