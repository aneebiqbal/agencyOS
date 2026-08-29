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
      headers: await authHeaders("hr", "hr-1"),
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it("allows all core roles", async () => {
    const request = new Request("http://localhost/api/payroll/runs", {
      method: "GET",
      headers: await authHeaders("cto", "cto-1"),
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/payroll/runs", { method: "GET" });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
