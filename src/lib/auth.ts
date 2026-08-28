import { unauthorized } from "@/lib/domain/errors";
import type { SessionUser, UserRole } from "@/lib/domain/types";

const validRoles: UserRole[] = ["owner", "finance", "manager", "employee"];

export function getSessionUser(request: Request): SessionUser {
  const userId = request.headers.get("x-user-id");
  const roleHeader = request.headers.get("x-user-role");

  if (!userId || !roleHeader || !validRoles.includes(roleHeader as UserRole)) {
    throw unauthorized();
  }

  return { userId, role: roleHeader as UserRole };
}
