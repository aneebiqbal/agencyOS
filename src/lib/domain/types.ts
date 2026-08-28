export type UserRole = "owner" | "finance" | "manager" | "employee";

export type LeadSource =
  | "referral"
  | "inbound-web"
  | "outbound"
  | "marketplace"
  | "other";

export type LeadStage = "new" | "qualified" | "proposal" | "won" | "lost";

export type DealPricingModel = "hourly" | "fixed" | "retainer";

export type ProjectStatus = "draft" | "active" | "completed" | "archived";

export type ExpenseCategory = "rent" | "software" | "travel" | "other";

export type ExpenseStatus = "submitted" | "approved" | "reimbursed";

export type InvoiceStatus =
  | "draft"
  | "ready_for_review"
  | "approved"
  | "sent"
  | "paid"
  | "send_failed";

export interface SessionUser {
  userId: string;
  role: UserRole;
}

export interface Lead {
  id: string;
  source: LeadSource;
  stage: LeadStage;
  valueEstimateCents: number;
  ownerUserId: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  deletedAtUtc: string | null;
}

export interface Deal {
  id: string;
  leadId: string;
  pricingModel: DealPricingModel;
  valueCents: number;
  stage: "open" | "won" | "lost";
  closeDateUtc: string | null;
  wonByUserId: string | null;
  projectId: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  version: number;
  deletedAtUtc: string | null;
}

export interface Project {
  id: string;
  clientName: string;
  budgetCents: number;
  billingModel: DealPricingModel;
  status: ProjectStatus;
  createdByUserId: string;
  managerUserId: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  version: number;
  deletedAtUtc: string | null;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
}

export interface TimeEntry {
  id: string;
  employeeUserId: string;
  projectId: string;
  hours: number;
  billable: boolean;
  description: string;
  workDateUtc: string;
  createdAtUtc: string;
  billedInvoiceId: string | null;
  deletedAtUtc: string | null;
}

export interface Expense {
  id: string;
  employeeUserId: string;
  category: ExpenseCategory;
  amountCents: number;
  approverUserId: string;
  receiptUrl: string;
  status: ExpenseStatus;
  incurredAtUtc: string;
  createdAtUtc: string;
  deletedAtUtc: string | null;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitAmountCents: number;
  lineTotalCents: number;
}

export interface Invoice {
  id: string;
  projectId: string;
  clientName: string;
  currency: "USD";
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: InvoiceStatus;
  dueDateUtc: string;
  issuedAtUtc: string;
  createdByUserId: string;
  sendAttempts: number;
  lastSendError: string | null;
  deletedAtUtc: string | null;
}

export interface PayrollRunSummary {
  id: string;
  periodStartUtc: string;
  periodEndUtc: string;
  providerRefId: string;
  status: "pending" | "completed" | "failed";
  totalCostCents: number;
}

export interface PerformanceSnapshot {
  id: string;
  employeeUserId: string;
  periodStartUtc: string;
  periodEndUtc: string;
  utilizationPercent: number;
  onTimeDeliveryPercent: number;
  attributableRevenueCents: number;
  createdAtUtc: string;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string;
  action: string;
  entity: string;
  entityId: string;
  beforeJson: string | null;
  afterJson: string | null;
  timestampUtc: string;
}

export interface StoredIdempotentResponse {
  status: number;
  body: Record<string, unknown>;
}
