import { randomUUID } from "node:crypto";

import type {
  AuditLogEntry,
  Deal,
  Expense,
  Invoice,
  Lead,
  PayrollRunSummary,
  PerformanceSnapshot,
  Project,
  ProjectMember,
  SessionUser,
  StoredIdempotentResponse,
  TimeEntry,
  UserRole,
} from "@/lib/domain/types";

interface EmployeeRecord {
  userId: string;
  role: UserRole;
  managerUserId: string | null;
  payrollProviderRef: string | null;
}

interface MutableState {
  leads: Lead[];
  deals: Deal[];
  projects: Project[];
  projectMembers: ProjectMember[];
  timeEntries: TimeEntry[];
  expenses: Expense[];
  invoices: Invoice[];
  payrollRuns: PayrollRunSummary[];
  performanceSnapshots: PerformanceSnapshot[];
  auditLogs: AuditLogEntry[];
  employees: EmployeeRecord[];
  idempotencyByKey: Record<string, StoredIdempotentResponse>;
}

export interface DataStore {
  getState(): MutableState;
  transaction<T>(fn: (state: MutableState) => T): T;
  appendAuditLog(
    actor: SessionUser,
    action: string,
    entity: string,
    entityId: string,
    beforeData: unknown,
    afterData: unknown,
  ): void;
}

function cloneState(state: MutableState): MutableState {
  return {
    leads: structuredClone(state.leads),
    deals: structuredClone(state.deals),
    projects: structuredClone(state.projects),
    projectMembers: structuredClone(state.projectMembers),
    timeEntries: structuredClone(state.timeEntries),
    expenses: structuredClone(state.expenses),
    invoices: structuredClone(state.invoices),
    payrollRuns: structuredClone(state.payrollRuns),
    performanceSnapshots: structuredClone(state.performanceSnapshots),
    auditLogs: structuredClone(state.auditLogs),
    employees: structuredClone(state.employees),
    idempotencyByKey: structuredClone(state.idempotencyByKey),
  };
}

function createInitialState(): MutableState {
  const now = new Date().toISOString();

  // Assumption: seeded records are TEST ONLY and used for local verification.
  const leads: Lead[] = [
    {
      id: "lead-test-1",
      source: "inbound-web",
      stage: "proposal",
      valueEstimateCents: 150_000,
      ownerUserId: "owner-1",
      createdAtUtc: now,
      updatedAtUtc: now,
      deletedAtUtc: null,
    },
  ];

  return {
    leads,
    deals: [
      {
        id: "deal-test-1",
        leadId: "lead-test-1",
        pricingModel: "hourly",
        valueCents: 500_000,
        stage: "open",
        closeDateUtc: null,
        wonByUserId: null,
        projectId: null,
        createdAtUtc: now,
        updatedAtUtc: now,
        version: 1,
        deletedAtUtc: null,
      },
    ],
    projects: [
      {
        id: "project-test-1",
        clientName: "TEST CLIENT",
        budgetCents: 300_000,
        billingModel: "hourly",
        status: "active",
        createdByUserId: "owner-1",
        managerUserId: "cto-1",
        createdAtUtc: now,
        updatedAtUtc: now,
        version: 1,
        deletedAtUtc: null,
      },
    ],
    projectMembers: [
      { projectId: "project-test-1", userId: "owner-1" },
      { projectId: "project-test-1", userId: "hr-1" },
      { projectId: "project-test-1", userId: "cto-1" },
    ],
    timeEntries: [],
    expenses: [],
    invoices: [],
    payrollRuns: [
      {
        id: "payroll-summary-test-1",
        periodStartUtc: "2026-08-01T00:00:00.000Z",
        periodEndUtc: "2026-08-15T23:59:59.999Z",
        providerRefId: "provider-run-123",
        status: "completed",
        totalCostCents: 120_000,
      },
    ],
    performanceSnapshots: [
      {
        id: "performance-test-1",
        employeeUserId: "staff-1",
        periodStartUtc: "2026-08-01T00:00:00.000Z",
        periodEndUtc: "2026-08-15T23:59:59.999Z",
        utilizationPercent: 72,
        onTimeDeliveryPercent: 90,
        attributableRevenueCents: 220_000,
        createdAtUtc: now,
      },
    ],
    auditLogs: [],
    employees: [
      { userId: "owner-1", role: "owner", managerUserId: null, payrollProviderRef: "prov-owner-1" },
      {
        userId: "hr-1",
        role: "hr",
        managerUserId: "owner-1",
        payrollProviderRef: "prov-hr-1",
      },
      {
        userId: "cto-1",
        role: "cto",
        managerUserId: "owner-1",
        payrollProviderRef: "prov-cto-1",
      },
    ],
    idempotencyByKey: {},
  };
}

export function createInMemoryStore(): DataStore {
  let state = createInitialState();

  return {
    getState() {
      return state;
    },
    transaction<T>(fn: (current: MutableState) => T): T {
      const draft = cloneState(state);
      const result = fn(draft);
      state = draft;
      return result;
    },
    appendAuditLog(actor, action, entity, entityId, beforeData, afterData) {
      const entry: AuditLogEntry = {
        id: randomUUID(),
        actorUserId: actor.userId,
        action,
        entity,
        entityId,
        beforeJson: beforeData ? JSON.stringify(beforeData) : null,
        afterJson: afterData ? JSON.stringify(afterData) : null,
        timestampUtc: new Date().toISOString(),
      };
      state.auditLogs.push(entry);
    },
  };
}
