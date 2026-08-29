import { beforeEach, describe, expect, it } from "vitest";

import { POST as winDeal } from "@/app/api/deals/[dealId]/win/route";
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

  it("rejects non-member access even for core role", async () => {
    const winRequest = new Request("http://localhost/api/deals/deal-test-1/win", {
      method: "POST",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({ clientName: "Member Scoped Client", managerUserId: "cto-1" }),
    });
    const winResponse = await winDeal(winRequest, { params: Promise.resolve({ dealId: "deal-test-1" }) });
    const winBody = (await winResponse.json()) as { data: { project: { id: string } } };
    expect(winResponse.status).toBe(200);

    const budgetRequest = new Request("http://localhost/api/projects/scoped/budget", {
      method: "PATCH",
      headers: await authHeaders("hr", "hr-1", { "content-type": "application/json" }),
      body: JSON.stringify({ budgetCents: 410000, expectedVersion: 1 }),
    });
    const budgetResponse = await PATCH(budgetRequest, {
      params: Promise.resolve({ projectId: winBody.data.project.id }),
    });
    expect(budgetResponse.status).toBe(403);
  });
});
