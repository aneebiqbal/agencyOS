import { randomUUID } from "node:crypto";

import type { DataStore } from "@/lib/db/store";
import { badRequest, conflict, notFound } from "@/lib/domain/errors";
import type { SessionUser, TimeEntry } from "@/lib/domain/types";

function assertUtcDateNotFuture(utcIso: string): void {
  const now = Date.now();
  const candidate = Date.parse(utcIso);
  if (Number.isNaN(candidate)) {
    throw badRequest("workDateUtc must be a valid UTC ISO timestamp.");
  }
  if (candidate > now) {
    throw badRequest("Future-dated time entries are not allowed.");
  }
}

export function createTimeEntry(
  store: DataStore,
  actor: SessionUser,
  input: Omit<TimeEntry, "id" | "createdAtUtc" | "deletedAtUtc" | "billedInvoiceId">,
  idempotencyKey: string,
): TimeEntry {
  assertUtcDateNotFuture(input.workDateUtc);

  const duplicate = store.getState().idempotencyByKey[idempotencyKey];
  if (duplicate) {
    throw conflict("Duplicate submission detected. Reuse returned response for idempotent retry.");
  }

  const now = new Date().toISOString();
  const created = store.transaction((state) => {
    const project = state.projects.find(
      (item) => item.id === input.projectId && item.deletedAtUtc === null,
    );
    if (!project) {
      throw notFound("Project not found.");
    }

    const employee = state.employees.find((item) => item.userId === input.employeeUserId);
    if (!employee) {
      throw notFound("Employee not found.");
    }

    if (input.hours <= 0 || input.hours > 24) {
      throw badRequest("Hours must be greater than 0 and less than or equal to 24.");
    }

    const id = randomUUID();
    const entry: TimeEntry = {
      id,
      employeeUserId: input.employeeUserId,
      projectId: input.projectId,
      hours: input.hours,
      billable: input.billable,
      description: input.description,
      workDateUtc: input.workDateUtc,
      createdAtUtc: now,
      billedInvoiceId: null,
      deletedAtUtc: null,
    };
    state.timeEntries.push(entry);
    return entry;
  });

  store.transaction((state) => {
    state.idempotencyByKey[idempotencyKey] = {
      status: 201,
      body: {
        ok: true,
        data: created,
      },
    };
  });

  store.appendAuditLog(actor, "time_entry.create", "time_entry", created.id, null, created);
  return created;
}
