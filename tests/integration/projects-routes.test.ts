import { beforeEach, describe, expect, it } from "vitest";

import { PATCH } from "@/app/api/projects/[projectId]/budget/route";
import { GET } from "@/app/api/projects/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/projects and /api/projects/:projectId/budget", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("returns visible projects for a valid user", async () => {
    const request = new Request("http://localhost/api/projects", {
      method: "GET",
      headers: authHeaders("manager", "manager-1"),
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it("rejects invalid budget update payload", async () => {
    const request = new Request("http://localhost/api/projects/project-test-1/budget", {
      method: "PATCH",
      headers: authHeaders("manager", "manager-1", { "content-type": "application/json" }),
      body: JSON.stringify({ budgetCents: -1, expectedVersion: 1 }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ projectId: "project-test-1" }) });
    expect(response.status).toBe(400);
  });

  it("rejects unauthorized project list request", async () => {
    const request = new Request("http://localhost/api/projects", { method: "GET" });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
