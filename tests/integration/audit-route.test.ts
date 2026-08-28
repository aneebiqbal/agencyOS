import { beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/audit-logs/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/audit-logs", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("returns audit logs for authorized role", async () => {
    const request = new Request("http://localhost/api/audit-logs", {
      method: "GET",
      headers: authHeaders("owner", "owner-1"),
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it("rejects role without permission", async () => {
    const request = new Request("http://localhost/api/audit-logs", {
      method: "GET",
      headers: authHeaders("employee", "employee-1"),
    });
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/audit-logs", { method: "GET" });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
