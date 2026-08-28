import { forbidden } from "@/lib/domain/errors";
import type { Project, SessionUser, UserRole } from "@/lib/domain/types";

export function assertHasRole(user: SessionUser, allowed: UserRole[]): void {
  if (!allowed.includes(user.role)) {
    throw forbidden();
  }
}

export function canAccessProject(user: SessionUser, project: Project, isMember: boolean): boolean {
  if (user.role === "owner" || user.role === "finance") {
    return true;
  }
  if (user.role === "manager") {
    return project.managerUserId === user.userId || isMember;
  }

  return isMember;
}
