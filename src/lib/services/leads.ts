import { randomUUID } from "node:crypto";

import type { DataStore } from "@/lib/db/store";
import type { Lead, SessionUser } from "@/lib/domain/types";

export function createLead(
  store: DataStore,
  actor: SessionUser,
  input: Omit<Lead, "id" | "createdAtUtc" | "updatedAtUtc" | "deletedAtUtc">,
): Lead {
  const now = new Date().toISOString();
  const lead: Lead = {
    id: randomUUID(),
    source: input.source,
    stage: input.stage,
    valueEstimateCents: input.valueEstimateCents,
    ownerUserId: input.ownerUserId,
    createdAtUtc: now,
    updatedAtUtc: now,
    deletedAtUtc: null,
  };
  store.transaction((state) => {
    state.leads.push(lead);
  });
  store.appendAuditLog(actor, "lead.create", "lead", lead.id, null, lead);
  return lead;
}

export function listLeads(store: DataStore): Lead[] {
  return store.getState().leads.filter((lead) => lead.deletedAtUtc === null);
}
