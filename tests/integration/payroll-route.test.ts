import { beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/payroll/runs/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/payroll/runs", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("returns payroll run summaries", async () => {
    const request = new Request("http://localhost/api/payroll/runs", {
      method: "GET",
      headers: authHeaders("finance", "finance-1"),
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it("rejects role without finance access", async () => {
    const request = new Request("http://localhost/api/payroll/runs", {
      method: "GET",
      headers: authHeaders("employee", "employee-1"),
    });
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/payroll/runs", { method: "GET" });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
