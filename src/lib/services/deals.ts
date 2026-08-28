import { randomUUID } from "node:crypto";

import type { DataStore } from "@/lib/db/store";
import { conflict, notFound } from "@/lib/domain/errors";
import { assertValidLeadTransition } from "@/lib/domain/lead";
import type { Deal, Project, SessionUser } from "@/lib/domain/types";

export function markDealWonAndCreateProject(
  store: DataStore,
  actor: SessionUser,
  dealId: string,
  input: { clientName: string; managerUserId: string },
): { deal: Deal; project: Project } {
  const result = store.transaction((state) => {
    const deal = state.deals.find((item) => item.id === dealId && item.deletedAtUtc === null);
    if (!deal) {
      throw notFound("Deal not found.");
    }

    if (deal.stage === "won") {
      throw conflict("Deal is already marked as won.");
    }

    if (deal.stage === "lost") {
      throw conflict("Lost deals cannot be moved back to won.");
    }

    const lead = state.leads.find((item) => item.id === deal.leadId && item.deletedAtUtc === null);
    if (!lead) {
      throw notFound("Lead linked to this deal was not found.");
    }

    assertValidLeadTransition(lead.stage, "won");

    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      clientName: input.clientName,
      budgetCents: deal.valueCents,
      billingModel: deal.pricingModel,
      status: "active",
      createdByUserId: actor.userId,
      managerUserId: input.managerUserId,
      createdAtUtc: now,
      updatedAtUtc: now,
      version: 1,
      deletedAtUtc: null,
    };

    state.projects.push(project);
    state.projectMembers.push({ projectId: project.id, userId: input.managerUserId });

    const beforeDeal = structuredClone(deal);
    const beforeLead = structuredClone(lead);

    deal.stage = "won";
    deal.wonByUserId = actor.userId;
    deal.closeDateUtc = now;
    deal.updatedAtUtc = now;
    deal.projectId = project.id;
    deal.version += 1;

    lead.stage = "won";
    lead.updatedAtUtc = now;

    return {
      deal: structuredClone(deal),
      project,
      beforeDeal,
      beforeLead,
      afterLead: structuredClone(lead),
    };
  });

  store.appendAuditLog(actor, "project.create.from_deal", "project", result.project.id, null, result.project);
  store.appendAuditLog(actor, "deal.win", "deal", result.deal.id, result.beforeDeal, result.deal);
  store.appendAuditLog(actor, "lead.stage.update", "lead", result.afterLead.id, result.beforeLead, result.afterLead);

  return { deal: result.deal, project: result.project };
}
