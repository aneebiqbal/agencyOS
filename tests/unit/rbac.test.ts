import { describe, expect, it } from "vitest";

import { canAccessProject } from "@/lib/rbac";

const project = {
  id: "p1",
  clientName: "Test",
  budgetCents: 1,
  billingModel: "hourly" as const,
  status: "active" as const,
  createdByUserId: "owner-1",
  managerUserId: "manager-1",
  createdAtUtc: "2026-01-01T00:00:00.000Z",
  updatedAtUtc: "2026-01-01T00:00:00.000Z",
  version: 1,
  deletedAtUtc: null,
};

describe("project access control", () => {
  it("grants owner/finance global access", () => {
    expect(canAccessProject({ userId: "u1", role: "owner" }, project, false)).toBe(true);
    expect(canAccessProject({ userId: "u2", role: "finance" }, project, false)).toBe(true);
  });

  it("scopes employee access to membership", () => {
    expect(canAccessProject({ userId: "u3", role: "employee" }, project, true)).toBe(true);
    expect(canAccessProject({ userId: "u3", role: "employee" }, project, false)).toBe(false);
  });
});
