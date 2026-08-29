import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PoolClient } from "pg";

import { createInMemoryStore } from "@/lib/db/store";
import { queryAsActor, querySystem, transactionAsActor, isPostgresConfigured } from "@/lib/db/postgres";
import { badRequest, conflict, notFound } from "@/lib/domain/errors";
import { assertValidLeadTransition } from "@/lib/domain/lead";
import { calculateInvoiceTotals } from "@/lib/domain/invoice";
import type {
  AuditLogEntry,
  Deal,
  EmploymentType,
  Expense,
  Invoice,
  InvoiceLineItem,
  Lead,
  LeadStage,
  PayrollRunSummary,
  PerformanceSnapshot,
  Project,
  SessionUser,
  StaffDirectoryRecord,
  TimeEntry,
} from "@/lib/domain/types";
import { createExpense as createExpenseMemory } from "@/lib/services/expenses";
import { getFinanceSummary as getFinanceSummaryMemory } from "@/lib/services/finance";
import { generateInvoiceFromProjectTime as generateInvoiceMemory } from "@/lib/services/invoices";
import { createLead as createLeadMemory, listLeads as listLeadsMemory } from "@/lib/services/leads";
import { listPayrollRuns as listPayrollRunsMemory } from "@/lib/services/payroll";
import { listPerformanceSnapshotsForActor as listPerformanceMemory } from "@/lib/services/performance";
import {
  listProjects as listProjectsMemory,
  updateProjectBudgetWithOptimisticLock as updateProjectBudgetMemory,
} from "@/lib/services/projects";
import { createTimeEntry as createTimeEntryMemory } from "@/lib/services/time-entries";
import { markDealWonAndCreateProject as winDealMemory } from "@/lib/services/deals";
import type { ImportPreview } from "@/lib/import-pipeline";

let memoryStore = createInMemoryStore();
const INTERNAL_HOURLY_RATE_CENTS = 75;
let postgresInitializedForTests = false;
const READ_CACHE_TTL_MS = Number(process.env.READ_CACHE_TTL_MS ?? 8_000);

const readCache = new Map<string, { expiresAtMs: number; value: unknown }>();

function readCacheKey(actor: SessionUser, scope: string, args = ""): string {
  return `${actor.orgId}:${scope}:${args}`;
}

function invalidateReadCacheForOrg(orgId: string): void {
  for (const key of readCache.keys()) {
    if (key.startsWith(`${orgId}:`)) {
      readCache.delete(key);
    }
  }
}

async function withReadCache<T>(
  actor: SessionUser,
  scope: string,
  args: string,
  read: () => Promise<T>,
): Promise<T> {
  if (!isPostgresConfigured()) {
    return read();
  }

  const key = readCacheKey(actor, scope, args);
  const now = Date.now();
  const cached = readCache.get(key);
  if (cached && cached.expiresAtMs > now) {
    return cached.value as T;
  }

  const value = await read();
  readCache.set(key, { expiresAtMs: now + READ_CACHE_TTL_MS, value });
  return value;
}

interface ActorContext {
  userId: string;
  role: SessionUser["role"];
  orgId: string;
}

function actorWithOrg(actor: SessionUser): ActorContext {
  return {
    userId: actor.userId,
    role: actor.role,
    orgId: actor.orgId,
  };
}

function asIso(value: Date | string): string {
  return new Date(value).toISOString();
}

function mapLeadRow(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    source: row.source as Lead["source"],
    stage: row.stage as Lead["stage"],
    valueEstimateCents: Number(row.value_estimate_cents),
    ownerUserId: String(row.owner_user_id),
    createdAtUtc: asIso(row.created_at_utc as string),
    updatedAtUtc: asIso(row.updated_at_utc as string),
    deletedAtUtc: row.deleted_at_utc ? asIso(row.deleted_at_utc as string) : null,
  };
}

function mapProjectRow(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    clientName: String(row.client_name),
    budgetCents: Number(row.budget_cents),
    billingModel: row.billing_model as Project["billingModel"],
    status: row.status as Project["status"],
    createdByUserId: String(row.created_by_user_id),
    managerUserId: String(row.manager_user_id),
    createdAtUtc: asIso(row.created_at_utc as string),
    updatedAtUtc: asIso(row.updated_at_utc as string),
    version: Number(row.version),
    deletedAtUtc: row.deleted_at_utc ? asIso(row.deleted_at_utc as string) : null,
  };
}

function mapDealRow(row: Record<string, unknown>): Deal {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    pricingModel: row.pricing_model as Deal["pricingModel"],
    valueCents: Number(row.value_cents),
    stage: row.stage as Deal["stage"],
    closeDateUtc: row.close_date_utc ? asIso(row.close_date_utc as string) : null,
    wonByUserId: row.won_by_user_id ? String(row.won_by_user_id) : null,
    projectId: row.project_id ? String(row.project_id) : null,
    createdAtUtc: asIso(row.created_at_utc as string),
    updatedAtUtc: asIso(row.updated_at_utc as string),
    version: Number(row.version),
    deletedAtUtc: row.deleted_at_utc ? asIso(row.deleted_at_utc as string) : null,
  };
}

function mapTimeEntryRow(row: Record<string, unknown>): TimeEntry {
  return {
    id: String(row.id),
    employeeUserId: String(row.employee_user_id),
    projectId: String(row.project_id),
    hours: Number(row.hours),
    billable: Boolean(row.billable),
    description: String(row.description),
    workDateUtc: asIso(row.work_date_utc as string),
    createdAtUtc: asIso(row.created_at_utc as string),
    billedInvoiceId: row.billed_invoice_id ? String(row.billed_invoice_id) : null,
    deletedAtUtc: row.deleted_at_utc ? asIso(row.deleted_at_utc as string) : null,
  };
}

function mapExpenseRow(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id),
    employeeUserId: String(row.employee_user_id),
    category: row.category as Expense["category"],
    amountCents: Number(row.amount_cents),
    approverUserId: String(row.approver_user_id),
    receiptUrl: String(row.receipt_url),
    status: row.status as Expense["status"],
    incurredAtUtc: asIso(row.incurred_at_utc as string),
    createdAtUtc: asIso(row.created_at_utc as string),
    deletedAtUtc: row.deleted_at_utc ? asIso(row.deleted_at_utc as string) : null,
  };
}

function mapInvoiceRow(
  row: Record<string, unknown>,
  lineItems: InvoiceLineItem[],
): Invoice {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    clientName: String(row.client_name),
    currency: "USD",
    lineItems,
    subtotalCents: Number(row.subtotal_cents),
    taxCents: Number(row.tax_cents),
    totalCents: Number(row.total_cents),
    status: row.status as Invoice["status"],
    dueDateUtc: asIso(row.due_date_utc as string),
    issuedAtUtc: asIso(row.issued_at_utc as string),
    createdByUserId: String(row.created_by_user_id),
    sendAttempts: Number(row.send_attempts),
    lastSendError: row.last_send_error ? String(row.last_send_error) : null,
    deletedAtUtc: row.deleted_at_utc ? asIso(row.deleted_at_utc as string) : null,
  };
}

async function appendAuditLog(
  client: PoolClient,
  actor: ActorContext,
  action: string,
  entity: string,
  entityId: string,
  beforeJson: unknown,
  afterJson: unknown,
): Promise<void> {
  await client.query(
    `insert into app.audit_log_entries
      (org_id, id, actor_user_id, action, entity, entity_id, before_json, after_json, timestamp_utc, deleted_at_utc)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now(), null)`,
    [
      actor.orgId,
      randomUUID(),
      actor.userId,
      action,
      entity,
      entityId,
      beforeJson ? JSON.stringify(beforeJson) : null,
      afterJson ? JSON.stringify(afterJson) : null,
    ],
  );
}

async function reserveIdempotencyKey(
  client: PoolClient,
  actor: ActorContext,
  endpoint: string,
  idempotencyKey: string,
): Promise<{ replay: false } | { replay: true; status: number; body: Record<string, unknown> }> {
  const inserted = await client.query(
    `insert into app.idempotency_keys
      (org_id, endpoint, idempotency_key, actor_user_id, response_status, response_body, deleted_at_utc)
      values ($1, $2, $3, $4, 102, '{"ok":false,"pending":true}', null)
      on conflict do nothing
      returning response_status, response_body`,
    [actor.orgId, endpoint, idempotencyKey, actor.userId],
  );

  if (inserted.rowCount && inserted.rowCount > 0) {
    return { replay: false };
  }

  const existing = await client.query(
    `select response_status, response_body
       from app.idempotency_keys
      where org_id = $1 and endpoint = $2 and idempotency_key = $3`,
    [actor.orgId, endpoint, idempotencyKey],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return {
      replay: true,
      status: Number(existing.rows[0].response_status),
      body: existing.rows[0].response_body as Record<string, unknown>,
    };
  }

  return { replay: false };
}

async function storeIdempotentResponse(
  client: PoolClient,
  actor: ActorContext,
  endpoint: string,
  idempotencyKey: string,
  responseStatus: number,
  responseBody: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `update app.idempotency_keys
        set response_status = $4,
            response_body = $5::jsonb
      where org_id = $1 and endpoint = $2 and idempotency_key = $3`,
    [actor.orgId, endpoint, idempotencyKey, responseStatus, JSON.stringify(responseBody)],
  );
}

export async function listLeads(actor: SessionUser): Promise<Lead[]> {
  if (!isPostgresConfigured()) {
    return listLeadsMemory(memoryStore);
  }
  return withReadCache(actor, "listLeads", "", async () => {
    const rows = await queryAsActor(actorWithOrg(actor), "select * from app.leads where deleted_at_utc is null order by created_at_utc desc");
    return rows.map((row) => mapLeadRow(row));
  });
}

export async function createLead(
  actor: SessionUser,
  input: Pick<Lead, "source" | "stage" | "valueEstimateCents" | "ownerUserId">,
): Promise<Lead> {
  if (!isPostgresConfigured()) {
    return createLeadMemory(memoryStore, actor, input);
  }

  const ctx = actorWithOrg(actor);
  const created = await transactionAsActor(ctx, async (client) => {
    const ownerRows = await client.query(
      "select user_id from app.employees where org_id = $1 and user_id = $2 and deleted_at_utc is null limit 1",
      [ctx.orgId, input.ownerUserId],
    );
    if (ownerRows.rowCount === 0) {
      throw badRequest("Lead owner user id is not provisioned in core accounts. Use owner/hr/cto user id from Admin.");
    }

    const leadId = randomUUID();
    const leadRows = await client.query(
      `insert into app.leads
        (org_id, id, source, stage, value_estimate_cents, owner_user_id, created_at_utc, updated_at_utc, deleted_at_utc)
        values ($1, $2, $3, $4, $5, $6, now(), now(), null)
        returning *`,
      [ctx.orgId, leadId, input.source, input.stage, input.valueEstimateCents, input.ownerUserId],
    );
    const lead = mapLeadRow(leadRows.rows[0]);

    const dealId = randomUUID();
    await client.query(
      `insert into app.deals
        (org_id, id, lead_id, pricing_model, value_cents, stage, close_date_utc, won_by_user_id, project_id, version, created_at_utc, updated_at_utc, deleted_at_utc)
       values ($1, $2, $3, 'hourly', $4, 'open', null, null, null, 1, now(), now(), null)`,
      [ctx.orgId, dealId, lead.id, input.valueEstimateCents],
    );

    await appendAuditLog(client, ctx, "lead.create", "lead", lead.id, null, lead);
    await appendAuditLog(client, ctx, "deal.create.from_lead", "deal", dealId, null, {
      leadId: lead.id,
      valueCents: input.valueEstimateCents,
      stage: "open",
    });

    return lead;
  });

  invalidateReadCacheForOrg(ctx.orgId);
  return created;
}

export async function updateLeadStage(actor: SessionUser, leadId: string, stage: LeadStage): Promise<Lead> {
  if (!isPostgresConfigured()) {
    let updatedLead: Lead | null = null;
    memoryStore.transaction((state) => {
      const lead = state.leads.find((item) => item.id === leadId && item.deletedAtUtc === null);
      if (!lead) {
        throw notFound("Lead not found.");
      }
      if (lead.stage === stage) {
        updatedLead = lead;
        return;
      }
      if (stage === "won") {
        throw conflict("Use 'Convert won deal' to move a lead to won and create its project.");
      }

      assertValidLeadTransition(lead.stage, stage);
      const before = { ...lead };
      lead.stage = stage;
      lead.updatedAtUtc = new Date().toISOString();

      if (stage === "lost") {
        const linkedDeal = state.deals.find((deal) => deal.leadId === lead.id && deal.deletedAtUtc === null);
        if (linkedDeal && linkedDeal.stage === "open") {
          const beforeDeal = { ...linkedDeal };
          linkedDeal.stage = "lost";
          linkedDeal.closeDateUtc = new Date().toISOString();
          linkedDeal.updatedAtUtc = new Date().toISOString();
          linkedDeal.version += 1;
          memoryStore.appendAuditLog(actor, "deal.loss.from_lead", "deal", linkedDeal.id, beforeDeal, linkedDeal);
        }
      }

      updatedLead = { ...lead };
      memoryStore.appendAuditLog(actor, "lead.stage.update", "lead", lead.id, before, updatedLead);
    });
    if (!updatedLead) {
      throw notFound("Lead not found.");
    }
    return updatedLead;
  }

  const ctx = actorWithOrg(actor);
  const updated = await transactionAsActor(ctx, async (client) => {
    const leadRows = await client.query(
      "select * from app.leads where org_id = $1 and id = $2 and deleted_at_utc is null for update",
      [ctx.orgId, leadId],
    );
    if (leadRows.rowCount === 0) {
      throw notFound("Lead not found.");
    }

    const beforeLead = mapLeadRow(leadRows.rows[0]);
    if (beforeLead.stage === stage) {
      return beforeLead;
    }
    if (stage === "won") {
      throw conflict("Use 'Convert won deal' to move a lead to won and create its project.");
    }

    assertValidLeadTransition(beforeLead.stage, stage);

    const updatedLeadRows = await client.query(
      "update app.leads set stage = $3, updated_at_utc = now() where org_id = $1 and id = $2 returning *",
      [ctx.orgId, leadId, stage],
    );
    const afterLead = mapLeadRow(updatedLeadRows.rows[0]);

    if (stage === "lost") {
      const dealRows = await client.query(
        "select * from app.deals where org_id = $1 and lead_id = $2 and deleted_at_utc is null for update",
        [ctx.orgId, leadId],
      );
      if (dealRows.rowCount && dealRows.rowCount > 0) {
        const beforeDeal = mapDealRow(dealRows.rows[0]);
        if (beforeDeal.stage === "open") {
          const updatedDealRows = await client.query(
            `update app.deals
                set stage = 'lost', close_date_utc = now(), version = version + 1, updated_at_utc = now()
              where org_id = $1 and id = $2
              returning *`,
            [ctx.orgId, beforeDeal.id],
          );
          const afterDeal = mapDealRow(updatedDealRows.rows[0]);
          await appendAuditLog(client, ctx, "deal.loss.from_lead", "deal", afterDeal.id, beforeDeal, afterDeal);
        }
      }
    }

    await appendAuditLog(client, ctx, "lead.stage.update", "lead", beforeLead.id, beforeLead, afterLead);
    return afterLead;
  });

  invalidateReadCacheForOrg(ctx.orgId);
  return updated;
}

export async function listDeals(actor: SessionUser): Promise<Deal[]> {
  if (!isPostgresConfigured()) {
    return memoryStore.getState().deals.filter((deal) => deal.deletedAtUtc === null);
  }

  return withReadCache(actor, "listDeals", "", async () => {
    const rows = await queryAsActor(
      actorWithOrg(actor),
      "select * from app.deals where deleted_at_utc is null order by created_at_utc desc",
    );
    return rows.map((row) => mapDealRow(row));
  });
}

export async function createOpenDealForLead(actor: SessionUser, leadId: string): Promise<Deal> {
  if (!isPostgresConfigured()) {
    let createdDeal: Deal | null = null;
    memoryStore.transaction((state) => {
      const lead = state.leads.find((item) => item.id === leadId && item.deletedAtUtc === null);
      if (!lead) {
        throw notFound("Lead not found.");
      }
      if (lead.stage === "won") {
        throw conflict("Won lead already belongs to completed conversion flow.");
      }

      const existing = state.deals.find((deal) => deal.leadId === leadId && deal.deletedAtUtc === null);
      if (existing) {
        throw conflict("Deal already exists for this lead.");
      }

      createdDeal = {
        id: randomUUID(),
        leadId,
        pricingModel: "hourly",
        valueCents: lead.valueEstimateCents,
        stage: "open",
        closeDateUtc: null,
        wonByUserId: null,
        projectId: null,
        createdAtUtc: new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
        version: 1,
        deletedAtUtc: null,
      };

      state.deals.push(createdDeal);
      memoryStore.appendAuditLog(actor, "deal.create.repair", "deal", createdDeal.id, null, {
        leadId,
        valueCents: createdDeal.valueCents,
        stage: createdDeal.stage,
      });
    });

    if (!createdDeal) {
      throw conflict("Deal could not be created.");
    }
    return createdDeal;
  }

  const ctx = actorWithOrg(actor);
  const created = await transactionAsActor(ctx, async (client) => {
    const leadRows = await client.query(
      "select * from app.leads where org_id = $1 and id = $2 and deleted_at_utc is null for update",
      [ctx.orgId, leadId],
    );
    if (leadRows.rowCount === 0) {
      throw notFound("Lead not found.");
    }
    const lead = mapLeadRow(leadRows.rows[0]);
    if (lead.stage === "won") {
      throw conflict("Won lead already belongs to completed conversion flow.");
    }

    const existingDealRows = await client.query(
      "select * from app.deals where org_id = $1 and lead_id = $2 and deleted_at_utc is null limit 1",
      [ctx.orgId, leadId],
    );
    if (existingDealRows.rowCount && existingDealRows.rowCount > 0) {
      throw conflict("Deal already exists for this lead.");
    }

    const dealId = randomUUID();
    const dealRows = await client.query(
      `insert into app.deals
        (org_id, id, lead_id, pricing_model, value_cents, stage, close_date_utc, won_by_user_id, project_id, version, created_at_utc, updated_at_utc, deleted_at_utc)
       values ($1, $2, $3, 'hourly', $4, 'open', null, null, null, 1, now(), now(), null)
       returning *`,
      [ctx.orgId, dealId, leadId, lead.valueEstimateCents],
    );

    const createdDeal = mapDealRow(dealRows.rows[0]);
    await appendAuditLog(client, ctx, "deal.create.repair", "deal", createdDeal.id, null, {
      leadId,
      valueCents: createdDeal.valueCents,
      stage: createdDeal.stage,
    });

    return createdDeal;
  });

  invalidateReadCacheForOrg(ctx.orgId);
  return created;
}

export async function listProjects(actor: SessionUser): Promise<Project[]> {
  if (!isPostgresConfigured()) {
    return listProjectsMemory(memoryStore);
  }
  return withReadCache(actor, "listProjects", "", async () => {
    const rows = await queryAsActor(
      actorWithOrg(actor),
      "select * from app.projects where deleted_at_utc is null order by created_at_utc desc",
    );
    return rows.map((row) => mapProjectRow(row));
  });
}

export async function findProjectById(actor: SessionUser, projectId: string): Promise<Project | null> {
  if (!isPostgresConfigured()) {
    const project = listProjectsMemory(memoryStore).find((item) => item.id === projectId);
    return project ?? null;
  }
  const rows = await queryAsActor(
    actorWithOrg(actor),
    "select * from app.projects where id = $1 and deleted_at_utc is null",
    [projectId],
  );
  if (rows.length === 0) {
    return null;
  }
  return mapProjectRow(rows[0]);
}

export async function isProjectMember(
  actor: SessionUser,
  projectId: string,
  userId: string,
): Promise<boolean> {
  if (!isPostgresConfigured()) {
    return memoryStore
      .getState()
      .projectMembers.some((item) => item.projectId === projectId && item.userId === userId);
  }
  const rows = await queryAsActor(
    actorWithOrg(actor),
    "select 1 from app.project_members where project_id = $1 and user_id = $2 and deleted_at_utc is null",
    [projectId, userId],
  );
  return rows.length > 0;
}

export async function listProjectMemberUserIds(actor: SessionUser, projectId: string): Promise<string[]> {
  if (!isPostgresConfigured()) {
    return memoryStore
      .getState()
      .projectMembers.filter((item) => item.projectId === projectId)
      .map((item) => item.userId);
  }
  const rows = await queryAsActor(
    actorWithOrg(actor),
    "select user_id from app.project_members where project_id = $1 and deleted_at_utc is null order by user_id asc",
    [projectId],
  );
  return rows.map((row) => String(row.user_id));
}

export async function updateProjectBudget(
  actor: SessionUser,
  projectId: string,
  budgetCents: number,
  expectedVersion: number,
): Promise<Project> {
  if (!isPostgresConfigured()) {
    return updateProjectBudgetMemory(memoryStore, actor, projectId, budgetCents, expectedVersion);
  }
  const ctx = actorWithOrg(actor);
  const result = await transactionAsActor(ctx, async (client) => {
    const beforeRows = await client.query(
      "select * from app.projects where org_id = $1 and id = $2 and deleted_at_utc is null",
      [ctx.orgId, projectId],
    );
    if (beforeRows.rowCount === 0) {
      throw notFound("Project not found.");
    }
    const before = mapProjectRow(beforeRows.rows[0]);
    const updated = await client.query(
      `update app.projects
          set budget_cents = $3, version = version + 1, updated_at_utc = now()
        where org_id = $1 and id = $2 and version = $4 and deleted_at_utc is null
        returning *`,
      [ctx.orgId, projectId, budgetCents, expectedVersion],
    );
    if (updated.rowCount === 0) {
      throw conflict("Project was updated by someone else. Please refresh and retry.");
    }
    const after = mapProjectRow(updated.rows[0]);
    await appendAuditLog(client, ctx, "project.budget.update", "project", after.id, before, after);
    return after;
  });
  invalidateReadCacheForOrg(ctx.orgId);
  return result;
}

export async function markDealWonAndCreateProject(
  actor: SessionUser,
  dealId: string,
  input: { clientName: string; managerUserId: string },
): Promise<{ deal: Deal; project: Project }> {
  if (!isPostgresConfigured()) {
    return winDealMemory(memoryStore, actor, dealId, input);
  }
  const ctx = actorWithOrg(actor);
  return transactionAsActor(ctx, async (client) => {
    const managerRows = await client.query(
      "select user_id from app.employees where org_id = $1 and user_id = $2 and deleted_at_utc is null limit 1",
      [ctx.orgId, input.managerUserId],
    );
    if (managerRows.rowCount === 0) {
      throw badRequest("Project manager user id is not provisioned in core accounts.");
    }

    const dealRows = await client.query(
      "select * from app.deals where org_id = $1 and id = $2 and deleted_at_utc is null for update",
      [ctx.orgId, dealId],
    );
    if (dealRows.rowCount === 0) {
      throw notFound("Deal not found.");
    }
    const deal = mapDealRow(dealRows.rows[0]);
    if (deal.stage === "won") {
      throw conflict("Deal is already marked as won.");
    }
    if (deal.stage === "lost") {
      throw conflict("Lost deals cannot be moved back to won.");
    }

    const leadRows = await client.query(
      "select * from app.leads where org_id = $1 and id = $2 and deleted_at_utc is null for update",
      [ctx.orgId, deal.leadId],
    );
    if (leadRows.rowCount === 0) {
      throw notFound("Lead linked to this deal was not found.");
    }
    const lead = mapLeadRow(leadRows.rows[0]);
    assertValidLeadTransition(lead.stage, "won");

    const projectId = randomUUID();
    const projectRows = await client.query(
      `insert into app.projects
        (org_id, id, client_name, budget_cents, billing_model, status, created_by_user_id, manager_user_id, version, created_at_utc, updated_at_utc, deleted_at_utc)
       values ($1, $2, $3, $4, $5, 'active', $6, $7, 1, now(), now(), null)
       returning *`,
      [ctx.orgId, projectId, input.clientName, deal.valueCents, deal.pricingModel, actor.userId, input.managerUserId],
    );

    const project = mapProjectRow(projectRows.rows[0]);
    await client.query(
      `insert into app.project_members
        (org_id, project_id, user_id, created_at_utc, deleted_at_utc)
       values ($1, $2, $3, now(), null)
       on conflict do nothing`,
      [ctx.orgId, project.id, input.managerUserId],
    );

    // Assumption for automated rollback testing: a special client name intentionally forces a mid-transaction failure.
    if (input.clientName === "__force_tx_fail__") {
      throw badRequest("Forced transaction failure for rollback verification.");
    }

    const dealUpdateRows = await client.query(
      `update app.deals
          set stage = 'won', won_by_user_id = $3, close_date_utc = now(), project_id = $4, version = version + 1, updated_at_utc = now()
        where org_id = $1 and id = $2
        returning *`,
      [ctx.orgId, deal.id, actor.userId, project.id],
    );
    const updatedDeal = mapDealRow(dealUpdateRows.rows[0]);

    await client.query(
      "update app.leads set stage = 'won', updated_at_utc = now() where org_id = $1 and id = $2",
      [ctx.orgId, lead.id],
    );

    await appendAuditLog(client, ctx, "project.create.from_deal", "project", project.id, null, project);
    await appendAuditLog(client, ctx, "deal.win", "deal", updatedDeal.id, deal, updatedDeal);
    await appendAuditLog(client, ctx, "lead.stage.update", "lead", lead.id, lead, { ...lead, stage: "won" });

    const result = { deal: updatedDeal, project };
    invalidateReadCacheForOrg(ctx.orgId);
    return result;
  });
}

export async function createTimeEntry(
  actor: SessionUser,
  input: Omit<TimeEntry, "id" | "createdAtUtc" | "deletedAtUtc" | "billedInvoiceId">,
  idempotencyKey: string,
): Promise<{ status: number; body: Record<string, unknown>; created?: TimeEntry }> {
  if (!isPostgresConfigured()) {
    const created = createTimeEntryMemory(memoryStore, actor, input, idempotencyKey);
    return { status: 201, body: { ok: true, data: created }, created };
  }
  const ctx = actorWithOrg(actor);
  return transactionAsActor(ctx, async (client) => {
    const idem = await reserveIdempotencyKey(client, ctx, "/api/time-entries", idempotencyKey);
    if (idem.replay) {
      return { status: idem.status, body: idem.body };
    }

    const staffRows = await client.query(
      "select staff_id from app.staff_members where org_id = $1 and staff_id = $2 and deleted_at_utc is null limit 1",
      [ctx.orgId, input.employeeUserId],
    );
    if (staffRows.rowCount === 0) {
      throw badRequest("Employee staff id was not found. Add employee in Employees page first.");
    }

    const projectRows = await client.query(
      "select id from app.projects where org_id = $1 and id = $2 and deleted_at_utc is null limit 1",
      [ctx.orgId, input.projectId],
    );
    if (projectRows.rowCount === 0) {
      throw badRequest("Project id was not found.");
    }

    const insertRows = await client.query(
      `insert into app.time_entries
        (org_id, id, employee_user_id, project_id, hours, billable, description, work_date_utc, billed_invoice_id, created_at_utc, deleted_at_utc)
       values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, null, now(), null)
       returning *`,
      [ctx.orgId, randomUUID(), input.employeeUserId, input.projectId, input.hours, input.billable, input.description, input.workDateUtc],
    );

    const created = mapTimeEntryRow(insertRows.rows[0]);
    await appendAuditLog(client, ctx, "time_entry.create", "time_entry", created.id, null, created);
    const body = { ok: true, data: created };
    await storeIdempotentResponse(client, ctx, "/api/time-entries", idempotencyKey, 201, body);
    invalidateReadCacheForOrg(ctx.orgId);
    return { status: 201, body, created };
  });
}

export async function listTimeEntries(actor: SessionUser): Promise<TimeEntry[]> {
  if (!isPostgresConfigured()) {
    return memoryStore
      .getState()
      .timeEntries.filter((entry) => entry.deletedAtUtc === null)
      .sort((a, b) => Date.parse(b.workDateUtc) - Date.parse(a.workDateUtc));
  }

  return withReadCache(actor, "listTimeEntries", "", async () => {
    const rows = await queryAsActor(
      actorWithOrg(actor),
      "select * from app.time_entries where deleted_at_utc is null and voided_at_utc is null order by work_date_utc desc, created_at_utc desc",
    );
    return rows.map((row) => mapTimeEntryRow(row));
  });
}

export async function createExpense(
  actor: SessionUser,
  input: Omit<Expense, "id" | "status" | "createdAtUtc" | "deletedAtUtc">,
  idempotencyKey: string,
): Promise<{ status: number; body: Record<string, unknown>; created?: Expense }> {
  if (!isPostgresConfigured()) {
    const created = createExpenseMemory(memoryStore, actor, input, idempotencyKey);
    return { status: 201, body: { ok: true, data: created }, created };
  }
  const ctx = actorWithOrg(actor);
  return transactionAsActor(ctx, async (client) => {
    const idem = await reserveIdempotencyKey(client, ctx, "/api/expenses", idempotencyKey);
    if (idem.replay) {
      return { status: idem.status, body: idem.body };
    }

    const staffRows = await client.query(
      "select staff_id from app.staff_members where org_id = $1 and staff_id = $2 and deleted_at_utc is null limit 1",
      [ctx.orgId, input.employeeUserId],
    );
    if (staffRows.rowCount === 0) {
      throw badRequest("Employee staff id was not found. Add employee in Employees page first.");
    }

    const approverRows = await client.query(
      "select user_id from app.employees where org_id = $1 and user_id = $2 and deleted_at_utc is null limit 1",
      [ctx.orgId, input.approverUserId],
    );
    if (approverRows.rowCount === 0) {
      throw badRequest("Approver user id is not provisioned in core accounts.");
    }

    const insertRows = await client.query(
      `insert into app.expenses
        (org_id, id, employee_user_id, category, amount_cents, approver_user_id, receipt_url, status, incurred_at_utc, created_at_utc, deleted_at_utc)
       values ($1, $2, $3, $4, $5, $6, $7, 'submitted', $8::timestamptz, now(), null)
       returning *`,
      [
        ctx.orgId,
        randomUUID(),
        input.employeeUserId,
        input.category,
        input.amountCents,
        input.approverUserId,
        input.receiptUrl,
        input.incurredAtUtc,
      ],
    );
    const created = mapExpenseRow(insertRows.rows[0]);
    await appendAuditLog(client, ctx, "expense.create", "expense", created.id, null, created);
    const body = { ok: true, data: created };
    await storeIdempotentResponse(client, ctx, "/api/expenses", idempotencyKey, 201, body);
    invalidateReadCacheForOrg(ctx.orgId);
    return { status: 201, body, created };
  });
}

export async function listExpenses(actor: SessionUser): Promise<Expense[]> {
  if (!isPostgresConfigured()) {
    return memoryStore
      .getState()
      .expenses.filter((expense) => expense.deletedAtUtc === null)
      .sort((a, b) => Date.parse(b.incurredAtUtc) - Date.parse(a.incurredAtUtc));
  }

  return withReadCache(actor, "listExpenses", "", async () => {
    const rows = await queryAsActor(
      actorWithOrg(actor),
      "select * from app.expenses where deleted_at_utc is null and voided_at_utc is null order by incurred_at_utc desc, created_at_utc desc",
    );
    return rows.map((row) => mapExpenseRow(row));
  });
}

export async function updateExpenseStatus(
  actor: SessionUser,
  expenseId: string,
  nextStatus: Expense["status"],
): Promise<Expense> {
  if (!isPostgresConfigured()) {
    const updated = memoryStore.transaction((state) => {
      const match = state.expenses.find((expense) => expense.id === expenseId && expense.deletedAtUtc === null);
      if (!match) {
        throw notFound("Expense not found.");
      }
      match.status = nextStatus;
      return structuredClone(match);
    });
    memoryStore.appendAuditLog(actor, "expense.status.update", "expense", expenseId, null, updated);
    return updated;
  }

  const ctx = actorWithOrg(actor);
  return transactionAsActor(ctx, async (client) => {
    const beforeRows = await client.query(
      "select * from app.expenses where org_id = $1 and id = $2 and deleted_at_utc is null and voided_at_utc is null for update",
      [ctx.orgId, expenseId],
    );
    if (beforeRows.rowCount === 0) {
      throw notFound("Expense not found.");
    }

    const before = mapExpenseRow(beforeRows.rows[0]);
    const updatedRows = await client.query(
      "update app.expenses set status = $3 where org_id = $1 and id = $2 returning *",
      [ctx.orgId, expenseId, nextStatus],
    );
    const updated = mapExpenseRow(updatedRows.rows[0]);
    await appendAuditLog(client, ctx, "expense.status.update", "expense", expenseId, before, updated);
    invalidateReadCacheForOrg(ctx.orgId);
    return updated;
  });
}

export async function generateInvoiceFromProjectTime(
  actor: SessionUser,
  input: { projectId: string; dueDateUtc: string; taxRateBps: number },
): Promise<{ invoice: Invoice; sendQueued: boolean; sendError: string | null }> {
  if (!isPostgresConfigured()) {
    return generateInvoiceMemory(memoryStore, actor, input);
  }

  const ctx = actorWithOrg(actor);
  return transactionAsActor(ctx, async (client) => {
    const projectRows = await client.query(
      "select * from app.projects where org_id = $1 and id = $2 and deleted_at_utc is null",
      [ctx.orgId, input.projectId],
    );
    if (projectRows.rowCount === 0) {
      throw notFound("Project not found.");
    }
    const project = mapProjectRow(projectRows.rows[0]);

    const entriesRows = await client.query(
      `select * from app.time_entries
        where org_id = $1 and project_id = $2 and billable = true and billed_invoice_id is null and deleted_at_utc is null and voided_at_utc is null
        for update`,
      [ctx.orgId, input.projectId],
    );
    if (entriesRows.rowCount === 0) {
      throw badRequest("No billable, unbilled time entries found for this project.");
    }

    const entries = entriesRows.rows.map((row) => mapTimeEntryRow(row));
    const entryIds = entries.map((entry) => entry.id);
    const lineItems: InvoiceLineItem[] = entries.map((entry) => {
      const quantity = Math.round(entry.hours * 100);
      return {
        description: `${entry.description} (${entry.hours}h)`,
        quantity,
        unitAmountCents: INTERNAL_HOURLY_RATE_CENTS,
        lineTotalCents: quantity * INTERNAL_HOURLY_RATE_CENTS,
      };
    });

    const totals = calculateInvoiceTotals(lineItems, input.taxRateBps);
    const invoiceId = randomUUID();

    const invoiceRows = await client.query(
      `insert into app.invoices
        (org_id, id, project_id, client_name, currency, subtotal_cents, tax_cents, total_cents, status, due_date_utc, issued_at_utc, created_by_user_id, send_attempts, last_send_error, deleted_at_utc)
       values ($1, $2, $3, $4, 'USD', $5, $6, $7, 'approved', $8::timestamptz, now(), $9, 0, null, null)
       returning *`,
      [
        ctx.orgId,
        invoiceId,
        input.projectId,
        project.clientName,
        totals.subtotalCents,
        totals.taxCents,
        totals.totalCents,
        input.dueDateUtc,
        actor.userId,
      ],
    );

    for (const item of lineItems) {
      await client.query(
        `insert into app.invoice_line_items
          (org_id, id, invoice_id, description, quantity, unit_amount_cents, line_total_cents, deleted_at_utc)
         values ($1, $2, $3, $4, $5, $6, $7, null)`,
        [ctx.orgId, randomUUID(), invoiceId, item.description, item.quantity, item.unitAmountCents, item.lineTotalCents],
      );
    }

    await client.query(
      "update app.time_entries set billed_invoice_id = $3 where org_id = $1 and id = any($2::uuid[]) and billed_invoice_id is null and deleted_at_utc is null and voided_at_utc is null",
      [ctx.orgId, entryIds, invoiceId],
    );

    await appendAuditLog(client, ctx, "invoice.generate", "invoice", invoiceId, null, invoiceRows.rows[0]);

    const shouldFailSend = project.clientName.toLowerCase().includes("fail-send");
    let sendQueued = true;
    let sendError: string | null = null;

    if (shouldFailSend) {
      sendQueued = false;
      sendError = "Invoice delivery provider unavailable.";
      await client.query(
        `update app.invoices
            set status = 'send_failed', send_attempts = send_attempts + 1, last_send_error = $3
          where org_id = $1 and id = $2`,
        [ctx.orgId, invoiceId, sendError],
      );
    } else {
      await client.query(
        `update app.invoices
            set status = 'sent', send_attempts = send_attempts + 1
          where org_id = $1 and id = $2`,
        [ctx.orgId, invoiceId],
      );
    }

    const finalInvoiceRows = await client.query("select * from app.invoices where org_id = $1 and id = $2", [
      ctx.orgId,
      invoiceId,
    ]);
    const itemRows = await client.query(
      "select description, quantity, unit_amount_cents, line_total_cents from app.invoice_line_items where org_id = $1 and invoice_id = $2 and deleted_at_utc is null",
      [ctx.orgId, invoiceId],
    );
    const mappedItems: InvoiceLineItem[] = itemRows.rows.map((item) => ({
      description: String(item.description),
      quantity: Number(item.quantity),
      unitAmountCents: Number(item.unit_amount_cents),
      lineTotalCents: Number(item.line_total_cents),
    }));

    const invoice = mapInvoiceRow(finalInvoiceRows.rows[0], mappedItems);
    invalidateReadCacheForOrg(ctx.orgId);
    return { invoice, sendQueued, sendError };
  });
}

export async function listInvoices(actor: SessionUser): Promise<Invoice[]> {
  if (!isPostgresConfigured()) {
    return memoryStore
      .getState()
      .invoices.filter((invoice) => invoice.deletedAtUtc === null)
      .sort((a, b) => Date.parse(b.issuedAtUtc) - Date.parse(a.issuedAtUtc));
  }

  const ctx = actorWithOrg(actor);
  return withReadCache(actor, "listInvoices", "", async () => {
    return transactionAsActor(ctx, async (client) => {
      const rows = await client.query(
        "select * from app.invoices where org_id = $1 and deleted_at_utc is null order by issued_at_utc desc",
        [ctx.orgId],
      );
      const lineRows = await client.query(
        "select invoice_id, description, quantity, unit_amount_cents, line_total_cents from app.invoice_line_items where org_id = $1 and deleted_at_utc is null order by invoice_id asc, id asc",
        [ctx.orgId],
      );

      const lineItemsByInvoice = new Map<string, InvoiceLineItem[]>();
      for (const line of lineRows.rows) {
        const invoiceId = String(line.invoice_id);
        const list = lineItemsByInvoice.get(invoiceId) ?? [];
        list.push({
          description: String(line.description),
          quantity: Number(line.quantity),
          unitAmountCents: Number(line.unit_amount_cents),
          lineTotalCents: Number(line.line_total_cents),
        });
        lineItemsByInvoice.set(invoiceId, list);
      }

      return rows.rows.map((row) => mapInvoiceRow(row, lineItemsByInvoice.get(String(row.id)) ?? []));
    });
  });
}

export async function retryInvoiceSend(actor: SessionUser, invoiceId: string): Promise<Invoice> {
  if (!isPostgresConfigured()) {
    const updated = memoryStore.transaction((state) => {
      const match = state.invoices.find((invoice) => invoice.id === invoiceId && invoice.deletedAtUtc === null);
      if (!match) {
        throw notFound("Invoice not found.");
      }
      if (match.status !== "send_failed") {
        throw badRequest("Only send_failed invoices can be retried.");
      }

      match.status = "sent";
      match.sendAttempts += 1;
      match.lastSendError = null;
      return structuredClone(match);
    });
    memoryStore.appendAuditLog(actor, "invoice.send.retry", "invoice", invoiceId, null, updated);
    return updated;
  }

  const ctx = actorWithOrg(actor);
  return transactionAsActor(ctx, async (client) => {
    const beforeRows = await client.query(
      "select * from app.invoices where org_id = $1 and id = $2 and deleted_at_utc is null for update",
      [ctx.orgId, invoiceId],
    );
    if (beforeRows.rowCount === 0) {
      throw notFound("Invoice not found.");
    }
    if (String(beforeRows.rows[0].status) !== "send_failed") {
      throw badRequest("Only send_failed invoices can be retried.");
    }

    const updatedRows = await client.query(
      `update app.invoices
          set status = 'sent', send_attempts = send_attempts + 1, last_send_error = null
        where org_id = $1 and id = $2
        returning *`,
      [ctx.orgId, invoiceId],
    );

    const lineRows = await client.query(
      "select description, quantity, unit_amount_cents, line_total_cents from app.invoice_line_items where org_id = $1 and invoice_id = $2 and deleted_at_utc is null order by id asc",
      [ctx.orgId, invoiceId],
    );
    const lineItems: InvoiceLineItem[] = lineRows.rows.map((line) => ({
      description: String(line.description),
      quantity: Number(line.quantity),
      unitAmountCents: Number(line.unit_amount_cents),
      lineTotalCents: Number(line.line_total_cents),
    }));
    const updated = mapInvoiceRow(updatedRows.rows[0], lineItems);
    await appendAuditLog(client, ctx, "invoice.send.retry", "invoice", invoiceId, beforeRows.rows[0], updatedRows.rows[0]);
    invalidateReadCacheForOrg(ctx.orgId);
    return updated;
  });
}

export async function updateInvoiceStatus(
  actor: SessionUser,
  invoiceId: string,
  nextStatus: Invoice["status"],
): Promise<Invoice> {
  if (nextStatus !== "paid") {
    throw badRequest("Only status 'paid' is currently supported.");
  }

  if (!isPostgresConfigured()) {
    const updated = memoryStore.transaction((state) => {
      const match = state.invoices.find((invoice) => invoice.id === invoiceId && invoice.deletedAtUtc === null);
      if (!match) {
        throw notFound("Invoice not found.");
      }
      if (match.status !== "sent") {
        throw badRequest("Only sent invoices can be marked as paid.");
      }
      match.status = "paid";
      return structuredClone(match);
    });
    memoryStore.appendAuditLog(actor, "invoice.status.update", "invoice", invoiceId, null, updated);
    return updated;
  }

  const ctx = actorWithOrg(actor);
  const updated = await transactionAsActor(ctx, async (client) => {
    const beforeRows = await client.query(
      "select * from app.invoices where org_id = $1 and id = $2 and deleted_at_utc is null for update",
      [ctx.orgId, invoiceId],
    );
    if (beforeRows.rowCount === 0) {
      throw notFound("Invoice not found.");
    }

    const before = String(beforeRows.rows[0].status);
    if (before !== "sent") {
      throw badRequest("Only sent invoices can be marked as paid.");
    }

    const updatedRows = await client.query(
      `update app.invoices
          set status = 'paid'
        where org_id = $1 and id = $2
        returning *`,
      [ctx.orgId, invoiceId],
    );

    const lineRows = await client.query(
      "select description, quantity, unit_amount_cents, line_total_cents from app.invoice_line_items where org_id = $1 and invoice_id = $2 and deleted_at_utc is null order by id asc",
      [ctx.orgId, invoiceId],
    );
    const lineItems: InvoiceLineItem[] = lineRows.rows.map((line) => ({
      description: String(line.description),
      quantity: Number(line.quantity),
      unitAmountCents: Number(line.unit_amount_cents),
      lineTotalCents: Number(line.line_total_cents),
    }));

    const invoice = mapInvoiceRow(updatedRows.rows[0], lineItems);
    await appendAuditLog(client, ctx, "invoice.status.update", "invoice", invoiceId, beforeRows.rows[0], updatedRows.rows[0]);
    return invoice;
  });

  invalidateReadCacheForOrg(ctx.orgId);
  return updated;
}

export async function listPayrollRuns(actor: SessionUser): Promise<PayrollRunSummary[]> {
  if (!isPostgresConfigured()) {
    return listPayrollRunsMemory(memoryStore);
  }
  return withReadCache(actor, "listPayrollRuns", "", async () => {
    const rows = await queryAsActor(
      actorWithOrg(actor),
      "select * from app.payroll_runs where deleted_at_utc is null order by period_start_utc desc",
    );
    return rows.map((row) => ({
      id: String(row.id),
      periodStartUtc: asIso(row.period_start_utc as string),
      periodEndUtc: asIso(row.period_end_utc as string),
      providerRefId: String(row.provider_ref_id),
      status: row.status as PayrollRunSummary["status"],
      totalCostCents: Number(row.total_cost_cents),
    }));
  });
}

export async function listPerformanceSnapshots(actor: SessionUser): Promise<PerformanceSnapshot[]> {
  if (!isPostgresConfigured()) {
    return listPerformanceMemory(memoryStore, actor);
  }
  return withReadCache(actor, "listPerformanceSnapshots", "", async () => {
    const rows = await queryAsActor(
      actorWithOrg(actor),
      "select * from app.performance_snapshots where deleted_at_utc is null order by period_start_utc desc",
    );
    return rows.map((row) => ({
      id: String(row.id),
      employeeUserId: String(row.employee_user_id),
      periodStartUtc: asIso(row.period_start_utc as string),
      periodEndUtc: asIso(row.period_end_utc as string),
      utilizationPercent: Number(row.utilization_percent),
      onTimeDeliveryPercent: Number(row.on_time_delivery_percent),
      attributableRevenueCents: Number(row.attributable_revenue_cents),
      createdAtUtc: asIso(row.created_at_utc as string),
    }));
  });
}

export async function getFinanceSummary(
  actor: SessionUser,
  periodStartUtc: string,
  periodEndUtc: string,
): Promise<{
  periodStartUtc: string;
  periodEndUtc: string;
  revenueInCents: number;
  payrollOutCents: number;
  expenseOutCents: number;
  netMarginCents: number;
}> {
  if (!isPostgresConfigured()) {
    return getFinanceSummaryMemory(memoryStore, periodStartUtc, periodEndUtc);
  }
  return withReadCache(actor, "getFinanceSummary", `${periodStartUtc}:${periodEndUtc}`, async () => {
    const rows = await queryAsActor(
      actorWithOrg(actor),
      `select
        coalesce((select sum(total_cents) from app.invoices where status = 'paid' and issued_at_utc between $1::timestamptz and $2::timestamptz and deleted_at_utc is null), 0) as revenue_in_cents,
        coalesce((select sum(total_cost_cents) from app.payroll_runs where status = 'completed' and period_start_utc >= $1::timestamptz and period_end_utc <= $2::timestamptz and deleted_at_utc is null), 0) as payroll_out_cents,
        coalesce((select sum(amount_cents) from app.expenses where status = 'reimbursed' and incurred_at_utc between $1::timestamptz and $2::timestamptz and deleted_at_utc is null and voided_at_utc is null), 0) as expense_out_cents`,
      [periodStartUtc, periodEndUtc],
    );

    const data = rows[0];
    const revenueInCents = Number(data.revenue_in_cents);
    const payrollOutCents = Number(data.payroll_out_cents);
    const expenseOutCents = Number(data.expense_out_cents);

    return {
      periodStartUtc,
      periodEndUtc,
      revenueInCents,
      payrollOutCents,
      expenseOutCents,
      netMarginCents: revenueInCents - payrollOutCents - expenseOutCents,
    };
  });
}

export async function listAuditLogs(actor: SessionUser): Promise<AuditLogEntry[]> {
  if (!isPostgresConfigured()) {
    return memoryStore.getState().auditLogs;
  }
  return withReadCache(actor, "listAuditLogs", "", async () => {
    const rows = await queryAsActor(
      actorWithOrg(actor),
      "select * from app.audit_log_entries where deleted_at_utc is null order by timestamp_utc desc",
    );
    return rows.map((row) => ({
      id: String(row.id),
      actorUserId: String(row.actor_user_id),
      action: String(row.action),
      entity: String(row.entity),
      entityId: String(row.entity_id),
      beforeJson: row.before_json ? JSON.stringify(row.before_json) : null,
      afterJson: row.after_json ? JSON.stringify(row.after_json) : null,
      timestampUtc: asIso(row.timestamp_utc as string),
    })) as AuditLogEntry[];
  });
}

export async function getLatestConfidentialityNotice(
  actor: SessionUser,
): Promise<{ version: string; noticeText: string } | null> {
  if (!isPostgresConfigured()) {
    return {
      version: "v1",
      noticeText: "PLACEHOLDER CONFIDENTIALITY NOTICE - REQUIRES LEGAL REVIEW",
    };
  }

  const rows = await queryAsActor(
    actorWithOrg(actor),
    `select version, notice_text
       from app.confidentiality_notice_versions
      where deleted_at_utc is null
      order by published_at_utc desc
      limit 1`,
  );
  if (rows.length === 0) {
    return null;
  }
  return {
    version: String(rows[0].version),
    noticeText: String(rows[0].notice_text),
  };
}

export async function hasAcknowledgedConfidentiality(
  actor: SessionUser,
  version: string,
): Promise<boolean> {
  if (!isPostgresConfigured()) {
    void actor;
    void version;
    return true;
  }
  const rows = await queryAsActor(
    actorWithOrg(actor),
    `select 1
       from app.confidentiality_acknowledgements
      where org_id = $1 and user_id = $2 and notice_version = $3 and deleted_at_utc is null
      limit 1`,
    [actor.orgId, actor.userId, version],
  );
  return rows.length > 0;
}

export async function acknowledgeConfidentiality(
  actor: SessionUser,
  version: string,
): Promise<void> {
  if (!isPostgresConfigured()) {
    return;
  }
  await transactionAsActor(actorWithOrg(actor), async (client) => {
    const id = randomUUID();
    await client.query(
      `insert into app.confidentiality_acknowledgements
        (org_id, id, user_id, notice_version, acknowledged_at_utc, deleted_at_utc)
       values ($1, $2, $3, $4, now(), null)`,
      [actor.orgId, id, actor.userId, version],
    );
    await appendAuditLog(client, actorWithOrg(actor), "confidentiality.ack", "notice", version, null, {
      version,
      userId: actor.userId,
    });
  });
}

export async function publishConfidentialityNotice(
  actor: SessionUser,
  version: string,
  noticeText: string,
): Promise<void> {
  if (!isPostgresConfigured()) {
    return;
  }

  await transactionAsActor(actorWithOrg(actor), async (client) => {
    await client.query(
      `insert into app.confidentiality_notice_versions (version, notice_text, deleted_at_utc)
       values ($1, $2, null)`,
      [version, noticeText],
    );

    await appendAuditLog(client, actorWithOrg(actor), "confidentiality.notice.publish", "notice", version, null, {
      version,
    });
  });
}

export async function logSensitiveView(
  actor: SessionUser,
  viewKey: string,
  subjectId: string | null,
): Promise<void> {
  if (!isPostgresConfigured()) {
    return;
  }
  await transactionAsActor(actorWithOrg(actor), async (client) => {
    await client.query(
      `insert into app.sensitive_view_events
        (org_id, id, viewer_user_id, view_key, subject_id, viewed_at_utc, deleted_at_utc)
       values ($1, $2, $3, $4, $5, now(), null)`,
      [actor.orgId, randomUUID(), actor.userId, viewKey, subjectId],
    );
    await appendAuditLog(client, actorWithOrg(actor), "sensitive_view.open", "view", viewKey, null, {
      subjectId,
    });
  });
}

export async function updateMyProfileDisplayName(
  actor: SessionUser,
  displayName: string,
): Promise<{ userId: string; displayName: string | null }> {
  if (!isPostgresConfigured()) {
    return { userId: actor.userId, displayName };
  }

  const rows = await queryAsActor(
    actorWithOrg(actor),
    `insert into app.user_profiles (org_id, user_id, display_name, created_at_utc, updated_at_utc, deleted_at_utc)
      values ($1, $2, $3, now(), now(), null)
      on conflict (org_id, user_id)
      do update set display_name = excluded.display_name, updated_at_utc = now()
      returning user_id, display_name`,
    [actor.orgId, actor.userId, displayName],
  );

  invalidateReadCacheForOrg(actor.orgId);

  return {
    userId: String(rows[0].user_id),
    displayName: rows[0].display_name ? String(rows[0].display_name) : null,
  };
}

export async function listStaffMembers(
  actor: SessionUser,
): Promise<Array<{ staffId: string; fullName: string }>> {
  if (!isPostgresConfigured()) {
    return [
      { staffId: "staff-1", fullName: "Jordan Lee" },
      { staffId: "staff-2", fullName: "Avery Stone" },
      { staffId: "staff-3", fullName: "Morgan Diaz" },
    ];
  }
  return withReadCache(actor, "listStaffMembers", "", async () => {
    const rows = await queryAsActor(
      actorWithOrg(actor),
      "select staff_id, full_name from app.staff_members where deleted_at_utc is null order by full_name asc",
    );
    return rows.map((row) => ({ staffId: String(row.staff_id), fullName: String(row.full_name) }));
  });
}

export async function listCoreUsers(
  actor: SessionUser,
): Promise<Array<{ userId: string; role: SessionUser["role"]; fullName: string }>> {
  if (!isPostgresConfigured()) {
    return [
      { userId: "owner-1", role: "owner", fullName: "Owner Account" },
      { userId: "hr-1", role: "hr", fullName: "HR Account" },
      { userId: "cto-1", role: "cto", fullName: "CTO Account" },
    ];
  }

  return withReadCache(actor, "listCoreUsers", "", async () => {
    const rows = await queryAsActor(
      actorWithOrg(actor),
      `select e.user_id,
              e.role::text as role,
              coalesce(nullif(p.display_name, ''), e.full_name) as full_name
         from app.employees e
         left join app.user_profiles p
           on p.org_id = e.org_id and p.user_id = e.user_id and p.deleted_at_utc is null
        where e.deleted_at_utc is null
        order by e.role asc`,
    );

    return rows.map((row) => ({
      userId: String(row.user_id),
      role: String(row.role) as SessionUser["role"],
      fullName: String(row.full_name),
    }));
  });
}

export async function listStaffDirectory(actor: SessionUser): Promise<StaffDirectoryRecord[]> {
  if (!isPostgresConfigured()) {
    return [
      {
        staffId: "staff-1",
        fullName: "Jordan Lee",
        externalCode: "E-1001",
        employmentType: "full_time",
        annualSalaryCents: 16000000,
        hourlyRateCents: null,
        currency: "PKR",
        updatedAtUtc: new Date().toISOString(),
      },
      {
        staffId: "staff-2",
        fullName: "Avery Stone",
        externalCode: "E-1002",
        employmentType: "contractor",
        annualSalaryCents: null,
        hourlyRateCents: 11000,
        currency: "USD",
        updatedAtUtc: new Date().toISOString(),
      },
    ];
  }

  return withReadCache(actor, "listStaffDirectory", "", async () => {
    let rows: Record<string, unknown>[];
    try {
      rows = await queryAsActor(
        actorWithOrg(actor),
        `select
         s.staff_id,
         s.full_name,
         s.external_code,
         c.employment_type,
         c.annual_salary_cents,
         c.hourly_rate_cents,
         c.currency,
         c.updated_at_utc
        from app.staff_members s
        left join app.staff_compensation c
          on c.org_id = s.org_id and c.staff_id = s.staff_id and c.deleted_at_utc is null
        where s.org_id = $1 and s.deleted_at_utc is null
        order by s.full_name asc`,
        [actor.orgId],
      );
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : null;
      if (code !== "42P01") {
        throw error;
      }

      rows = await queryAsActor(
        actorWithOrg(actor),
        `select
         s.staff_id,
         s.full_name,
         s.external_code,
         null::text as employment_type,
         null::bigint as annual_salary_cents,
         null::bigint as hourly_rate_cents,
         'USD'::text as currency,
         null::timestamptz as updated_at_utc
        from app.staff_members s
        where s.org_id = $1 and s.deleted_at_utc is null
        order by s.full_name asc`,
        [actor.orgId],
      );
    }

    return rows.map((row) => ({
      staffId: String(row.staff_id),
      fullName: String(row.full_name),
      externalCode: row.external_code ? String(row.external_code) : null,
      employmentType: row.employment_type ? (String(row.employment_type) as EmploymentType) : null,
      annualSalaryCents: row.annual_salary_cents != null ? Number(row.annual_salary_cents) : null,
      hourlyRateCents: row.hourly_rate_cents != null ? Number(row.hourly_rate_cents) : null,
      currency: (row.currency ? String(row.currency) : "USD") as "USD" | "PKR",
      updatedAtUtc: row.updated_at_utc ? asIso(row.updated_at_utc as string) : null,
    }));
  });
}

export async function createStaffMember(
  actor: SessionUser,
  input: { staffId: string; fullName: string; externalCode?: string },
): Promise<{ staffId: string; fullName: string; externalCode: string | null }> {
  if (!isPostgresConfigured()) {
    return {
      staffId: input.staffId,
      fullName: input.fullName,
      externalCode: input.externalCode ?? null,
    };
  }

  const existing = await queryAsActor(
    actorWithOrg(actor),
    "select staff_id from app.staff_members where org_id = $1 and staff_id = $2 and deleted_at_utc is null limit 1",
    [actor.orgId, input.staffId],
  );
  if (existing.length > 0) {
    throw conflict("Staff member already exists.");
  }

  await queryAsActor(
    actorWithOrg(actor),
    `insert into app.staff_members (org_id, staff_id, full_name, external_code, deleted_at_utc)
     values ($1, $2, $3, $4, null)`,
    [actor.orgId, input.staffId, input.fullName, input.externalCode ?? null],
  );

  invalidateReadCacheForOrg(actor.orgId);

  return {
    staffId: input.staffId,
    fullName: input.fullName,
    externalCode: input.externalCode ?? null,
  };
}

export async function upsertStaffCompensation(
  actor: SessionUser,
  staffId: string,
  input: {
    employmentType: EmploymentType;
    annualSalaryCents: number | null;
    hourlyRateCents: number | null;
    currency: "USD" | "PKR";
  },
): Promise<void> {
  if (!isPostgresConfigured()) {
    return;
  }

  await queryAsActor(
    actorWithOrg(actor),
    `insert into app.staff_compensation
      (org_id, staff_id, employment_type, annual_salary_cents, hourly_rate_cents, currency, updated_at_utc, deleted_at_utc)
     values ($1, $2, $3, $4, $5, $6, now(), null)
     on conflict (org_id, staff_id)
     do update set
       employment_type = excluded.employment_type,
       annual_salary_cents = excluded.annual_salary_cents,
       hourly_rate_cents = excluded.hourly_rate_cents,
       currency = excluded.currency,
       updated_at_utc = now(),
       deleted_at_utc = null`,
    [actor.orgId, staffId, input.employmentType, input.annualSalaryCents, input.hourlyRateCents, input.currency],
  );

  invalidateReadCacheForOrg(actor.orgId);
}

export async function listProjectNames(actor: SessionUser): Promise<string[]> {
  const projects = await listProjects(actor);
  return projects.map((project) => project.clientName);
}

export async function hasImportedFileHash(actor: SessionUser, hash: string): Promise<boolean> {
  if (!isPostgresConfigured()) {
    return false;
  }
  const rows = await queryAsActor(
    actorWithOrg(actor),
    `select 1 from app.import_batches
      where org_id = $1 and file_hash_sha256 = $2 and deleted_at_utc is null and status = 'confirmed' and force_reimport = false
      limit 1`,
    [actor.orgId, hash],
  );
  return rows.length > 0;
}

export async function confirmImportBatch(
  actor: SessionUser,
  preview: ImportPreview,
  decisions: {
    forceReimport: boolean;
    rowEmployeeLinks: Record<number, string>;
    rowProjectDecisions: Record<number, { action: "use_existing" | "create_project" | "skip"; projectName?: string }>;
  },
): Promise<{ batchId: string; importedRows: number; flaggedRows: number; skippedRows: number }> {
  if (!isPostgresConfigured()) {
    return { batchId: randomUUID(), importedRows: 0, flaggedRows: preview.flaggedRows.length, skippedRows: preview.skippedRows.length };
  }

  const coreCtx = actorWithOrg(actor);
  return transactionAsActor(coreCtx, async (client) => {
    const existing = await client.query(
      `select id from app.import_batches
        where org_id = $1 and file_hash_sha256 = $2 and deleted_at_utc is null and status = 'confirmed' and force_reimport = false
        limit 1`,
      [actor.orgId, preview.fileHashSha256],
    );
    if (existing.rowCount && existing.rowCount > 0 && !decisions.forceReimport) {
      throw conflict("This file hash was already imported. Use explicit force re-import to continue.");
    }

    if (preview.unmappedColumns.length > 0) {
      throw badRequest("Cannot confirm import while unmapped columns remain.");
    }

    const batchId = randomUUID();
    await client.query(
      `insert into app.import_batches
        (org_id, id, importer_user_id, source_filename, file_hash_sha256, force_reimport, total_rows, clean_rows, flagged_rows, skipped_rows, imported_rows, status, deleted_at_utc)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'confirmed', null)`,
      [
        actor.orgId,
        batchId,
        actor.userId,
        preview.sourceFilename,
        preview.fileHashSha256,
        decisions.forceReimport,
        preview.totals.total,
        preview.totals.clean,
        preview.totals.flagged,
        preview.totals.skipped,
      ],
    );

    let importedRows = 0;

    const allRows = [...preview.cleanRows, ...preview.flaggedRows, ...preview.skippedRows].sort(
      (a, b) => a.rowNumber - b.rowNumber,
    );

    for (const row of allRows) {
      const hardFlags = row.flags.filter((flag) => flag.requiresHuman);
      let status: "clean" | "flagged" | "skipped" | "imported" = row.flags.length === 0 ? "clean" : "flagged";
      let createdTimeEntryId: string | null = null;
      let createdExpenseId: string | null = null;

      const chosenEmployee = decisions.rowEmployeeLinks[row.rowNumber] ?? row.normalized.employeeId;
      const projectDecision = decisions.rowProjectDecisions[row.rowNumber];

      if (hardFlags.length > 0 && (!chosenEmployee || !projectDecision)) {
        status = "skipped";
      } else if (row.rowType === "time_entry" && row.normalized.hours !== null && row.normalized.dateUtc && chosenEmployee) {
        const projectName =
          projectDecision?.action === "create_project"
            ? projectDecision.projectName ?? row.normalized.projectName
            : row.normalized.projectName;
        if (!projectName) {
          status = "skipped";
        } else {
          const projectRow = await client.query(
            "select id from app.projects where org_id = $1 and lower(client_name) = lower($2) and deleted_at_utc is null limit 1",
            [actor.orgId, projectName],
          );
          let projectId = projectRow.rowCount && projectRow.rows[0]?.id ? String(projectRow.rows[0].id) : null;
          if (!projectId && projectDecision?.action === "create_project") {
            projectId = randomUUID();
            await client.query(
              `insert into app.projects
                (org_id, id, client_name, budget_cents, billing_model, status, created_by_user_id, manager_user_id, version, created_at_utc, updated_at_utc, deleted_at_utc)
               values ($1, $2, $3, 0, 'hourly', 'draft', $4, $4, 1, now(), now(), null)`,
              [actor.orgId, projectId, projectName, actor.userId],
            );
          }

          if (!projectId) {
            status = "skipped";
          } else {
            createdTimeEntryId = randomUUID();
            await client.query(
              `insert into app.time_entries
                (org_id, id, employee_user_id, project_id, hours, billable, description, work_date_utc, billed_invoice_id, import_batch_id, voided_at_utc, void_reason, created_at_utc, deleted_at_utc)
               values ($1, $2, $3, $4, $5, true, $6, $7::timestamptz, null, $8, null, null, now(), null)`,
              [
                actor.orgId,
                createdTimeEntryId,
                chosenEmployee,
                projectId,
                row.normalized.hours,
                row.normalized.description,
                row.normalized.dateUtc,
                batchId,
              ],
            );
            importedRows += 1;
            status = "imported";
          }
        }
      } else if (row.rowType === "expense" && row.normalized.amountCents !== null && row.normalized.dateUtc && chosenEmployee) {
        createdExpenseId = randomUUID();
        await client.query(
          `insert into app.expenses
            (org_id, id, employee_user_id, category, amount_cents, approver_user_id, receipt_url, status, incurred_at_utc, import_batch_id, voided_at_utc, void_reason, created_at_utc, deleted_at_utc)
           values ($1, $2, $3, $4, $5, $6, '', 'approved', $7::timestamptz, $8, null, null, now(), null)`,
          [
            actor.orgId,
            createdExpenseId,
            chosenEmployee,
            (row.normalized.category ?? "other") as Expense["category"],
            row.normalized.amountCents,
            actor.userId,
            row.normalized.dateUtc,
            batchId,
          ],
        );
        importedRows += 1;
        status = "imported";
      }

      await client.query(
        `insert into app.import_batch_rows
          (org_id, id, batch_id, row_number, status, row_kind, raw_json, normalized_json, flags_json, created_time_entry_id, created_expense_id, deleted_at_utc)
         values ($1, $2, $3, $4, $5::app.import_row_status, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, null)`,
        [
          actor.orgId,
          randomUUID(),
          batchId,
          row.rowNumber,
          status,
          row.rowType,
          JSON.stringify(row.raw),
          JSON.stringify(row.normalized),
          JSON.stringify(row.flags),
          createdTimeEntryId,
          createdExpenseId,
        ],
      );
    }

    await client.query(
      "update app.import_batches set imported_rows = $3 where org_id = $1 and id = $2",
      [actor.orgId, batchId, importedRows],
    );

    await appendAuditLog(client, coreCtx, "import_batch.confirm", "import_batch", batchId, null, {
      sourceFilename: preview.sourceFilename,
      hash: preview.fileHashSha256,
      importedRows,
    });

    return {
      batchId,
      importedRows,
      flaggedRows: preview.flaggedRows.length,
      skippedRows: preview.totals.total - importedRows,
    };
  });
}

export async function undoImportBatch(
  actor: SessionUser,
  batchId: string,
  reason: string,
): Promise<void> {
  if (!isPostgresConfigured()) {
    return;
  }

  const ctx = actorWithOrg(actor);
  await transactionAsActor(ctx, async (client) => {
    const batch = await client.query(
      "select id from app.import_batches where org_id = $1 and id = $2 and status = 'confirmed' and deleted_at_utc is null",
      [actor.orgId, batchId],
    );
    if (batch.rowCount === 0) {
      throw notFound("Import batch not found.");
    }

    const billedRows = await client.query(
      "select id, billed_invoice_id from app.time_entries where org_id = $1 and import_batch_id = $2 and deleted_at_utc is null and billed_invoice_id is not null limit 5",
      [actor.orgId, batchId],
    );
    if (billedRows.rowCount && billedRows.rowCount > 0) {
      const invoiceIds = Array.from(new Set(billedRows.rows.map((row) => String(row.billed_invoice_id))));
      throw conflict(`Import batch includes billed time entries linked to invoice(s): ${invoiceIds.join(", ")}. Reverse invoices before undo.`);
    }

    await client.query(
      "update app.time_entries set voided_at_utc = now(), void_reason = $3 where org_id = $1 and import_batch_id = $2 and deleted_at_utc is null",
      [actor.orgId, batchId, reason],
    );
    await client.query(
      "update app.expenses set voided_at_utc = now(), void_reason = $3 where org_id = $1 and import_batch_id = $2 and deleted_at_utc is null",
      [actor.orgId, batchId, reason],
    );
    await client.query(
      "update app.import_batch_rows set status = 'voided' where org_id = $1 and batch_id = $2 and deleted_at_utc is null",
      [actor.orgId, batchId],
    );
    await client.query(
      "update app.import_batches set status = 'voided', voided_at_utc = now(), void_reason = $3 where org_id = $1 and id = $2",
      [actor.orgId, batchId, reason],
    );

    await appendAuditLog(client, ctx, "import_batch.undo", "import_batch", batchId, null, { reason });
  });
}

export async function resetPersistenceForTests(): Promise<void> {
  if (!isPostgresConfigured()) {
    memoryStore = createInMemoryStore();
    return;
  }

  if (!postgresInitializedForTests) {
    const tableCheck = await querySystem<{ exists: string }>(
      `select to_regclass('app.organizations')::text as exists`,
    );
    if (!tableCheck[0]?.exists) {
      const migrationSql = await readFile(
        join(process.cwd(), "supabase/migrations/20260829040100_init_agency_os.sql"),
        "utf8",
      );
      await querySystem(migrationSql);
    }
    postgresInitializedForTests = true;
  }

  await querySystem(`
    truncate table
      app.idempotency_keys,
      app.revoked_sessions,
      app.audit_log_entries,
      app.invoice_line_items,
      app.time_entries,
      app.expenses,
      app.invoices,
      app.project_members,
      app.deals,
      app.projects,
      app.performance_snapshots,
      app.user_profiles,
      app.payroll_runs,
      app.leads,
      app.employees,
      app.organizations
    restart identity
    cascade;
  `);

  await querySystem(
    `insert into app.organizations (id, name, deleted_at_utc) values ('org-core-1', 'AGENCY CORE ORG', null)`,
  );

  await querySystem(
    `insert into app.employees (org_id, user_id, role, email, full_name, deleted_at_utc)
     values
      ('org-core-1', 'owner-1', 'owner', 'owner@agency.local', 'Owner Account', null),
      ('org-core-1', 'hr-1', 'hr', 'hr@agency.local', 'HR Account', null),
      ('org-core-1', 'cto-1', 'cto', 'cto@agency.local', 'CTO Account', null)`,
  );

  await querySystem(
    `insert into app.staff_members (org_id, staff_id, full_name, external_code, deleted_at_utc)
     values
      ('org-core-1', 'staff-1', 'Jordan Lee', 'EMP-001', null),
      ('org-core-1', 'staff-2', 'Avery Stone', 'EMP-002', null),
      ('org-core-1', 'staff-3', 'Morgan Diaz', 'EMP-003', null)`,
  );

  const now = new Date().toISOString();
  await querySystem(
    `insert into app.leads (org_id, id, source, stage, value_estimate_cents, owner_user_id, created_at_utc, updated_at_utc, deleted_at_utc)
     values ('org-core-1', 'lead-test-1', 'inbound-web', 'proposal', 150000, 'owner-1', $1::timestamptz, $1::timestamptz, null)`,
    [now],
  );

  await querySystem(
    `insert into app.deals (org_id, id, lead_id, pricing_model, value_cents, stage, close_date_utc, won_by_user_id, project_id, version, created_at_utc, updated_at_utc, deleted_at_utc)
     values ('org-core-1', 'deal-test-1', 'lead-test-1', 'hourly', 500000, 'open', null, null, null, 1, $1::timestamptz, $1::timestamptz, null)`,
    [now],
  );

  await querySystem(
    `insert into app.projects (org_id, id, client_name, budget_cents, billing_model, status, created_by_user_id, manager_user_id, version, created_at_utc, updated_at_utc, deleted_at_utc)
     values ('org-core-1', 'project-test-1', 'TEST CLIENT', 300000, 'hourly', 'active', 'owner-1', 'cto-1', 1, $1::timestamptz, $1::timestamptz, null)`,
    [now],
  );

  await querySystem(
    `insert into app.project_members (org_id, project_id, user_id, created_at_utc, deleted_at_utc)
     values ('org-core-1', 'project-test-1', 'owner-1', $1::timestamptz, null),
            ('org-core-1', 'project-test-1', 'hr-1', $1::timestamptz, null),
            ('org-core-1', 'project-test-1', 'cto-1', $1::timestamptz, null)`,
    [now],
  );

  await querySystem(
    `insert into app.payroll_runs (org_id, id, period_start_utc, period_end_utc, provider_ref_id, status, total_cost_cents, deleted_at_utc)
     values ('org-core-1', 'payroll-summary-test-1', '2026-08-01T00:00:00.000Z'::timestamptz, '2026-08-15T23:59:59.999Z'::timestamptz, 'provider-run-123', 'completed', 120000, null)`,
  );

  await querySystem(
    `insert into app.performance_snapshots (org_id, id, employee_user_id, period_start_utc, period_end_utc, utilization_percent, on_time_delivery_percent, attributable_revenue_cents, created_at_utc, deleted_at_utc)
     values ('org-core-1', 'performance-test-1', 'staff-1', '2026-08-01T00:00:00.000Z'::timestamptz, '2026-08-15T23:59:59.999Z'::timestamptz, 72, 90, 220000, $1::timestamptz, null)`,
    [now],
  );

  await querySystem(
    `insert into app.user_profiles (org_id, user_id, display_name, created_at_utc, updated_at_utc, deleted_at_utc)
     values ('org-core-1', 'owner-1', 'Owner One', $1::timestamptz, $1::timestamptz, null),
            ('org-core-1', 'hr-1', 'HR One', $1::timestamptz, $1::timestamptz, null),
            ('org-core-1', 'cto-1', 'CTO One', $1::timestamptz, $1::timestamptz, null)`,
    [now],
  );

  await querySystem(
    `insert into app.confidentiality_notice_versions (version, notice_text, deleted_at_utc)
     values ('v1', 'PLACEHOLDER CONFIDENTIALITY NOTICE - REQUIRES LEGAL REVIEW', null)`,
  );

  await querySystem(
    `insert into app.confidentiality_acknowledgements (org_id, id, user_id, notice_version, acknowledged_at_utc, deleted_at_utc)
     values
      ('org-core-1', 'ack-owner-1', 'owner-1', 'v1', $1::timestamptz, null),
      ('org-core-1', 'ack-hr-1', 'hr-1', 'v1', $1::timestamptz, null),
      ('org-core-1', 'ack-cto-1', 'cto-1', 'v1', $1::timestamptz, null)`,
    [now],
  );
}
