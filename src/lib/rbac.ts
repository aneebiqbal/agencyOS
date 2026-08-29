import { forbidden } from "@/lib/domain/errors";
import type { Project, SessionUser, UserRole } from "@/lib/domain/types";

export function assertHasRole(user: SessionUser, allowed: UserRole[]): void {
  if (!allowed.includes(user.role)) {
    throw forbidden();
  }
}

export function canAccessProject(user: SessionUser, _project: Project, _isMember: boolean): boolean {
  return _isMember || _project.managerUserId === user.userId || _project.createdByUserId === user.userId;
}
