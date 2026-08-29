import { describe, expect, it } from "vitest";

import { canAccessProject } from "@/lib/rbac";

const project = {
  id: "p1",
  clientName: "Test",
  budgetCents: 1,
  billingModel: "hourly" as const,
  status: "active" as const,
  createdByUserId: "owner-1",
  managerUserId: "cto-1",
  createdAtUtc: "2026-01-01T00:00:00.000Z",
  updatedAtUtc: "2026-01-01T00:00:00.000Z",
  version: 1,
  deletedAtUtc: null,
};

describe("project access control", () => {
  it("grants core-role global access", () => {
    expect(canAccessProject({ userId: "u1", role: "owner", orgId: "org-test-1" }, project, false)).toBe(
      true,
    );
    expect(canAccessProject({ userId: "u2", role: "hr", orgId: "org-test-1" }, project, false)).toBe(
      true,
    );
  });

  it("keeps cto access independent of membership", () => {
    expect(canAccessProject({ userId: "u3", role: "cto", orgId: "org-test-1" }, project, true)).toBe(
      true,
    );
    expect(canAccessProject({ userId: "u3", role: "cto", orgId: "org-test-1" }, project, false)).toBe(true);
  });
});
