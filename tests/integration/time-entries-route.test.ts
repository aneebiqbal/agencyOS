import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/time-entries/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/time-entries", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("creates a valid time entry", async () => {
    const request = new Request("http://localhost/api/time-entries", {
      method: "POST",
      headers: await authHeaders("hr", "hr-1", {
        "content-type": "application/json",
        "idempotency-key": "idem-time-1",
      }),
      body: JSON.stringify({
        employeeUserId: "owner-1",
        projectId: "project-test-1",
        hours: 6.5,
        billable: true,
        description: "Sprint implementation",
        workDateUtc: "2026-08-10T12:00:00.000Z",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it("rejects impossible values", async () => {
    const request = new Request("http://localhost/api/time-entries", {
      method: "POST",
      headers: await authHeaders("hr", "hr-1", {
        "content-type": "application/json",
        "idempotency-key": "idem-time-2",
      }),
      body: JSON.stringify({
        employeeUserId: "owner-1",
        projectId: "project-test-1",
        hours: -5,
        billable: true,
        description: "Invalid",
        workDateUtc: "2026-08-10T12:00:00.000Z",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects unauthorized request", async () => {
    const request = new Request("http://localhost/api/time-entries", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "idem-time-3",
      },
      body: JSON.stringify({
        employeeUserId: "owner-1",
        projectId: "project-test-1",
        hours: 2,
        billable: true,
        description: "Unauthorized",
        workDateUtc: "2026-08-10T12:00:00.000Z",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
