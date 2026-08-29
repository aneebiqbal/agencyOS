import { beforeEach, describe, expect, it } from "vitest";

import { GET as GET_CORE_USERS } from "@/app/api/core-users/route";
import { GET as GET_ME } from "@/app/api/me/route";
import { GET as GET_STAFF_DIRECTORY } from "@/app/api/staff-directory/route";
import { GET as GET_STAFF_MEMBERS, POST as POST_STAFF_MEMBER } from "@/app/api/staff-members/route";
import { PUT as PUT_STAFF_COMP } from "@/app/api/staff-members/[staffId]/compensation/route";
import { authHeaders, readJson, setupFreshState } from "../helpers";

describe("auxiliary route readiness", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("returns current actor from /api/me", async () => {
    const response = await GET_ME(
      new Request("http://localhost/api/me", {
        headers: await authHeaders("owner", "owner-1"),
      }),
    );
    const body = await readJson(response);
    const data = body.data as { userId: string; role: string; orgId: string; availableOrgIds: string[] };
    expect(response.status).toBe(200);
    expect(data.userId).toBe("owner-1");
    expect(data.role).toBe("owner");
    expect(data.availableOrgIds).toContain(data.orgId);
  });

  it("rejects unauthorized /api/me", async () => {
    const response = await GET_ME(new Request("http://localhost/api/me"));
    expect(response.status).toBe(401);
  });

  it("returns three core users", async () => {
    const response = await GET_CORE_USERS(
      new Request("http://localhost/api/core-users", {
        headers: await authHeaders("owner", "owner-1"),
      }),
    );
    const body = await readJson(response);
    const users = body.data as Array<{ role: string }>;
    expect(response.status).toBe(200);
    expect(users.length).toBe(3);
    expect(users.some((u) => u.role === "owner")).toBe(true);
  });

  it("lists staff members", async () => {
    const response = await GET_STAFF_MEMBERS(
      new Request("http://localhost/api/staff-members", {
        headers: await authHeaders("owner", "owner-1"),
      }),
    );
    const body = await readJson(response);
    const rows = body.data as Array<{ staffId: string }>;
    expect(response.status).toBe(200);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("creates staff member as hr", async () => {
    const response = await POST_STAFF_MEMBER(
      new Request("http://localhost/api/staff-members", {
        method: "POST",
        headers: await authHeaders("hr", "hr-1", { "content-type": "application/json" }),
        body: JSON.stringify({ staffId: "staff-900", fullName: "Pilot Hire", externalCode: "EMP-900" }),
      }),
    );
    expect(response.status).toBe(201);
  });

  it("rejects create staff for cto", async () => {
    const response = await POST_STAFF_MEMBER(
      new Request("http://localhost/api/staff-members", {
        method: "POST",
        headers: await authHeaders("cto", "cto-1", { "content-type": "application/json" }),
        body: JSON.stringify({ staffId: "staff-901", fullName: "Blocked User" }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("returns staff directory for owner", async () => {
    const response = await GET_STAFF_DIRECTORY(
      new Request("http://localhost/api/staff-directory", {
        headers: await authHeaders("owner", "owner-1"),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects staff directory for cto", async () => {
    const response = await GET_STAFF_DIRECTORY(
      new Request("http://localhost/api/staff-directory", {
        headers: await authHeaders("cto", "cto-1"),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("updates staff compensation for owner", async () => {
    const response = await PUT_STAFF_COMP(
      new Request("http://localhost/api/staff-members/staff-1/compensation", {
        method: "PUT",
        headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
        body: JSON.stringify({
          employmentType: "full_time",
          annualSalaryCents: 15000000,
          hourlyRateCents: null,
          currency: "PKR",
        }),
      }),
      { params: Promise.resolve({ staffId: "staff-1" }) },
    );
    expect(response.status).toBe(200);
  });

  it("rejects invalid compensation payload", async () => {
    const response = await PUT_STAFF_COMP(
      new Request("http://localhost/api/staff-members/staff-1/compensation", {
        method: "PUT",
        headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
        body: JSON.stringify({
          employmentType: "full_time",
          annualSalaryCents: null,
          hourlyRateCents: null,
          currency: "USD",
        }),
      }),
      { params: Promise.resolve({ staffId: "staff-1" }) },
    );
    expect(response.status).toBe(400);
  });
});
