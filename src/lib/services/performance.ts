import type { DataStore } from "@/lib/db/store";
import type { PerformanceSnapshot, SessionUser } from "@/lib/domain/types";

export function listPerformanceSnapshotsForActor(
  store: DataStore,
  actor: SessionUser,
): PerformanceSnapshot[] {
  if (actor.role === "owner" || actor.role === "finance") {
    return store.getState().performanceSnapshots;
  }

  if (actor.role === "manager") {
    const managedEmployeeIds = store
      .getState()
      .employees.filter((employee) => employee.managerUserId === actor.userId)
      .map((employee) => employee.userId);
    return store
      .getState()
      .performanceSnapshots.filter((item) => managedEmployeeIds.includes(item.employeeUserId));
  }

  return store
    .getState()
    .performanceSnapshots.filter((item) => item.employeeUserId === actor.userId);
}
