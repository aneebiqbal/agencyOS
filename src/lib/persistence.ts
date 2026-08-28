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
  Expense,
  Invoice,
  InvoiceLineItem,
  Lead,
  PayrollRunSummary,
  PerformanceSnapshot,
  Project,
  SessionUser,
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

const FALLBACK_ORG_ID = process.env.DEFAULT_ORG_ID ?? "org-test-1";
let memoryStore = createInMemoryStore();
const INTERNAL_HOURLY_RATE_CENTS = 75;
let postgresInitializedForTests = false;

interface ActorContext {
  userId: string;
  role: SessionUser["role"];
  orgId: string;
}

function actorWithOrg(actor: SessionUser): ActorContext {
  return {
    userId: actor.userId,
    role: actor.role,
    orgId: FALLBACK_ORG_ID,
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
  const rows = await queryAsActor(actorWithOrg(actor), "select * from app.leads where deleted_at_utc is null order by created_at_utc desc");
  return rows.map((row) => mapLeadRow(row));
}

export async function createLead(
  actor: SessionUser,
  input: Pick<Lead, "source" | "stage" | "valueEstimateCents" | "ownerUserId">,
): Promise<Lead> {
  if (!isPostgresConfigured()) {
    return createLeadMemory(memoryStore, actor, input);
  }

  const ctx = actorWithOrg(actor);
  const id = randomUUID();
  const rows = await queryAsActor(
    ctx,
    `insert into app.leads
      (org_id, id, source, stage, value_estimate_cents, owner_user_id, created_at_utc, updated_at_utc, deleted_at_utc)
      values ($1, $2, $3, $4, $5, $6, now(), now(), null)
      returning *`,
    [ctx.orgId, id, input.source, input.stage, input.valueEstimateCents, input.ownerUserId],
  );
  const lead = mapLeadRow(rows[0]);

  await transactionAsActor(ctx, async (client) => {
    await appendAuditLog(client, ctx, "lead.create", "lead", lead.id, null, lead);
  });

  return lead;
}

export async function listProjects(actor: SessionUser): Promise<Project[]> {
  if (!isPostgresConfigured()) {
    return listProjectsMemory(memoryStore);
  }
  const rows = await queryAsActor(
    actorWithOrg(actor),
    "select * from app.projects where deleted_at_utc is null order by created_at_utc desc",
  );
  return rows.map((row) => mapProjectRow(row));
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

    return { deal: updatedDeal, project };
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
    return { status: 201, body, created };
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
    return { status: 201, body, created };
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
        where org_id = $1 and project_id = $2 and billable = true and billed_invoice_id is null and deleted_at_utc is null
        for update`,
      [ctx.orgId, input.projectId],
    );
    if (entriesRows.rowCount === 0) {
      throw badRequest("No billable, unbilled time entries found for this project.");
    }

    const entries = entriesRows.rows.map((row) => mapTimeEntryRow(row));
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
      "update app.time_entries set billed_invoice_id = $3 where org_id = $1 and project_id = $2 and billable = true and billed_invoice_id is null and deleted_at_utc is null",
      [ctx.orgId, input.projectId, invoiceId],
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
    return { invoice, sendQueued, sendError };
  });
}

export async function listPayrollRuns(actor: SessionUser): Promise<PayrollRunSummary[]> {
  if (!isPostgresConfigured()) {
    return listPayrollRunsMemory(memoryStore);
  }
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
}

export async function listPerformanceSnapshots(actor: SessionUser): Promise<PerformanceSnapshot[]> {
  if (!isPostgresConfigured()) {
    return listPerformanceMemory(memoryStore, actor);
  }
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
  const rows = await queryAsActor(
    actorWithOrg(actor),
    `select
      coalesce((select sum(total_cents) from app.invoices where status = 'paid' and issued_at_utc between $1::timestamptz and $2::timestamptz and deleted_at_utc is null), 0) as revenue_in_cents,
      coalesce((select sum(total_cost_cents) from app.payroll_runs where status = 'completed' and period_start_utc >= $1::timestamptz and period_end_utc <= $2::timestamptz and deleted_at_utc is null), 0) as payroll_out_cents,
      coalesce((select sum(amount_cents) from app.expenses where status = 'reimbursed' and incurred_at_utc between $1::timestamptz and $2::timestamptz and deleted_at_utc is null), 0) as expense_out_cents`,
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
}

export async function listAuditLogs(actor: SessionUser): Promise<AuditLogEntry[]> {
  if (!isPostgresConfigured()) {
    return memoryStore.getState().auditLogs;
  }
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
      app.audit_log_entries,
      app.invoice_line_items,
      app.time_entries,
      app.expenses,
      app.invoices,
      app.project_members,
      app.deals,
      app.projects,
      app.performance_snapshots,
      app.payroll_runs,
      app.leads,
      app.employees,
      app.organizations
    restart identity
    cascade;
  `);

  await querySystem(
    `insert into app.organizations (id, name, deleted_at_utc) values ('org-test-1', 'TEST ORG ONE', null), ('org-test-2', 'TEST ORG TWO', null)`,
  );

  await querySystem(
    `insert into app.employees (org_id, user_id, role, manager_user_id, payroll_provider_ref, deleted_at_utc)
     values
      ('org-test-1', 'owner-1', 'owner', null, 'prov-owner-1', null),
      ('org-test-1', 'finance-1', 'finance', 'owner-1', 'prov-finance-1', null),
      ('org-test-1', 'manager-1', 'manager', 'owner-1', 'prov-manager-1', null),
      ('org-test-1', 'employee-1', 'employee', 'manager-1', 'prov-employee-1', null),
      ('org-test-1', 'employee-2', 'employee', 'manager-1', 'prov-employee-2', null),
      ('org-test-2', 'employee-3', 'employee', null, 'prov-employee-3', null)`,
  );

  const now = new Date().toISOString();
  await querySystem(
    `insert into app.leads (org_id, id, source, stage, value_estimate_cents, owner_user_id, created_at_utc, updated_at_utc, deleted_at_utc)
     values ('org-test-1', 'lead-test-1', 'inbound-web', 'proposal', 150000, 'owner-1', $1::timestamptz, $1::timestamptz, null)`,
    [now],
  );

  await querySystem(
    `insert into app.deals (org_id, id, lead_id, pricing_model, value_cents, stage, close_date_utc, won_by_user_id, project_id, version, created_at_utc, updated_at_utc, deleted_at_utc)
     values ('org-test-1', 'deal-test-1', 'lead-test-1', 'hourly', 500000, 'open', null, null, null, 1, $1::timestamptz, $1::timestamptz, null)`,
    [now],
  );

  await querySystem(
    `insert into app.projects (org_id, id, client_name, budget_cents, billing_model, status, created_by_user_id, manager_user_id, version, created_at_utc, updated_at_utc, deleted_at_utc)
     values ('org-test-1', 'project-test-1', 'TEST CLIENT', 300000, 'hourly', 'active', 'owner-1', 'manager-1', 1, $1::timestamptz, $1::timestamptz, null),
            ('org-test-2', 'project-test-2', 'OTHER ORG PROJECT', 100000, 'hourly', 'active', 'employee-3', 'employee-3', 1, $1::timestamptz, $1::timestamptz, null)`,
    [now],
  );

  await querySystem(
    `insert into app.project_members (org_id, project_id, user_id, created_at_utc, deleted_at_utc)
     values ('org-test-1', 'project-test-1', 'manager-1', $1::timestamptz, null),
            ('org-test-1', 'project-test-1', 'employee-1', $1::timestamptz, null),
            ('org-test-2', 'project-test-2', 'employee-3', $1::timestamptz, null)`,
    [now],
  );

  await querySystem(
    `insert into app.payroll_runs (org_id, id, period_start_utc, period_end_utc, provider_ref_id, status, total_cost_cents, deleted_at_utc)
     values ('org-test-1', 'payroll-summary-test-1', '2026-08-01T00:00:00.000Z'::timestamptz, '2026-08-15T23:59:59.999Z'::timestamptz, 'provider-run-123', 'completed', 120000, null)`,
  );

  await querySystem(
    `insert into app.performance_snapshots (org_id, id, employee_user_id, period_start_utc, period_end_utc, utilization_percent, on_time_delivery_percent, attributable_revenue_cents, created_at_utc, deleted_at_utc)
     values ('org-test-1', 'performance-test-1', 'employee-1', '2026-08-01T00:00:00.000Z'::timestamptz, '2026-08-15T23:59:59.999Z'::timestamptz, 72, 90, 220000, $1::timestamptz, null)`,
    [now],
  );
}
