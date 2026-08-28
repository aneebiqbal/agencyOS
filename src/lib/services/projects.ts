import type { DataStore } from "@/lib/db/store";
import { conflict, notFound } from "@/lib/domain/errors";
import type { Project, SessionUser } from "@/lib/domain/types";

export function listProjects(store: DataStore): Project[] {
  return store.getState().projects.filter((project) => project.deletedAtUtc === null);
}

export function updateProjectBudgetWithOptimisticLock(
  store: DataStore,
  actor: SessionUser,
  projectId: string,
  budgetCents: number,
  expectedVersion: number,
): Project {
  const result = store.transaction((state) => {
    const project = state.projects.find((item) => item.id === projectId && item.deletedAtUtc === null);
    if (!project) {
      throw notFound("Project not found.");
    }

    if (project.version !== expectedVersion) {
      throw conflict("Project was updated by someone else. Please refresh and retry.");
    }

    const beforeProject = structuredClone(project);
    project.budgetCents = budgetCents;
    project.version += 1;
    project.updatedAtUtc = new Date().toISOString();

    return { project: structuredClone(project), beforeProject };
  });

  store.appendAuditLog(
    actor,
    "project.budget.update",
    "project",
    result.project.id,
    result.beforeProject,
    result.project,
  );

  return result.project;
}
