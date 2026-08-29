import type { DataStore } from "@/lib/db/store";
import type { PerformanceSnapshot, SessionUser } from "@/lib/domain/types";

export function listPerformanceSnapshotsForActor(
  store: DataStore,
  actor: SessionUser,
): PerformanceSnapshot[] {
  if (actor.role === "owner" || actor.role === "hr" || actor.role === "cto") {
    return store.getState().performanceSnapshots;
  }

  return [];
}
