import { beforeEach, describe, expect, it } from "vitest";

import { PATCH } from "@/app/api/projects/[projectId]/budget/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/projects/:projectId/budget", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("updates budget with correct expectedVersion", async () => {
    const request = new Request("http://localhost/api/projects/project-test-1/budget", {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ budgetCents: 350000, expectedVersion: 1 }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ projectId: "project-test-1" }) });
    const body = (await response.json()) as { data: { budgetCents: number; version: number } };

    expect(response.status).toBe(200);
    expect(body.data.budgetCents).toBe(350000);
    expect(body.data.version).toBe(2);
  });

  it("rejects stale expectedVersion", async () => {
    const first = new Request("http://localhost/api/projects/project-test-1/budget", {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ budgetCents: 350000, expectedVersion: 1 }),
    });
    await PATCH(first, { params: Promise.resolve({ projectId: "project-test-1" }) });

    const stale = new Request("http://localhost/api/projects/project-test-1/budget", {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ budgetCents: 360000, expectedVersion: 1 }),
    });
    const response = await PATCH(stale, { params: Promise.resolve({ projectId: "project-test-1" }) });
    expect(response.status).toBe(409);
  });

  it("returns not found for missing project", async () => {
    const request = new Request("http://localhost/api/projects/missing/budget", {
      method: "PATCH",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ budgetCents: 350000, expectedVersion: 1 }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ projectId: "missing" }) });
    expect(response.status).toBe(404);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/projects/project-test-1/budget", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ budgetCents: 350000, expectedVersion: 1 }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ projectId: "project-test-1" }) });
    expect(response.status).toBe(401);
  });
});
