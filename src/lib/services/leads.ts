import { randomUUID } from "node:crypto";

import type { DataStore } from "@/lib/db/store";
import type { Deal, Lead, SessionUser } from "@/lib/domain/types";

export function createLead(
  store: DataStore,
  actor: SessionUser,
  input: Omit<Lead, "id" | "createdAtUtc" | "updatedAtUtc" | "deletedAtUtc">,
): Lead {
  const now = new Date().toISOString();
  const leadId = randomUUID();
  const lead: Lead = {
    id: leadId,
    source: input.source,
    stage: input.stage,
    valueEstimateCents: input.valueEstimateCents,
    ownerUserId: input.ownerUserId,
    createdAtUtc: now,
    updatedAtUtc: now,
    deletedAtUtc: null,
  };

  const deal: Deal = {
    id: randomUUID(),
    leadId,
    pricingModel: "hourly",
    valueCents: input.valueEstimateCents,
    stage: "open",
    closeDateUtc: null,
    wonByUserId: null,
    projectId: null,
    createdAtUtc: now,
    updatedAtUtc: now,
    version: 1,
    deletedAtUtc: null,
  };

  store.transaction((state) => {
    state.leads.push(lead);
    state.deals.push(deal);
  });
  store.appendAuditLog(actor, "lead.create", "lead", lead.id, null, lead);
  store.appendAuditLog(actor, "deal.create.from_lead", "deal", deal.id, null, {
    leadId: lead.id,
    valueCents: deal.valueCents,
    stage: deal.stage,
  });
  return lead;
}

export function listLeads(store: DataStore): Lead[] {
  return store.getState().leads.filter((lead) => lead.deletedAtUtc === null);
}
