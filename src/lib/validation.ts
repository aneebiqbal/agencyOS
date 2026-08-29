import { z } from "zod";

const isoUtcDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const createLeadSchema = z.object({
  source: z.enum(["referral", "inbound-web", "outbound", "marketplace", "other"]),
  stage: z.enum(["new", "qualified", "proposal", "won", "lost"]),
  valueEstimateCents: z.number().int().min(0).max(100_000_000),
  ownerUserId: z.string().min(1),
});

export const winDealSchema = z.object({
  clientName: z.string().trim().min(1).max(120),
  managerUserId: z.string().trim().min(1),
});

export const updateProjectBudgetSchema = z.object({
  budgetCents: z.number().int().min(0).max(500_000_000),
  expectedVersion: z.number().int().positive(),
});

export const createTimeEntrySchema = z.object({
  employeeUserId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  hours: z.number().positive().max(24),
  billable: z.boolean(),
  description: z.string().trim().min(1).max(500),
  workDateUtc: z.string().regex(isoUtcDatePattern),
});

export const createExpenseSchema = z.object({
  employeeUserId: z.string().trim().min(1),
  category: z.enum(["rent", "software", "travel", "other"]),
  amountCents: z.number().int().min(0).max(5_000_000),
  approverUserId: z.string().trim().min(1),
  receiptUrl: z.url(),
  incurredAtUtc: z.string().regex(isoUtcDatePattern),
});

export const generateInvoiceSchema = z.object({
  projectId: z.string().trim().min(1),
  dueDateUtc: z.string().regex(isoUtcDatePattern),
  taxRateBps: z.number().int().min(0).max(10000),
});

export const financeSummaryQuerySchema = z.object({
  fromUtc: z.string().regex(isoUtcDatePattern),
  toUtc: z.string().regex(isoUtcDatePattern),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["owner", "hr", "cto"]).optional(),
});

export const provisionUserSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(["owner", "hr", "cto"]),
  email: z.email(),
  fullName: z.string().trim().min(1).max(120),
});

export const importPreviewSchema = z.object({
  sourceFilename: z.string().trim().min(1),
  csvBase64: z.string().min(1),
  mappingOverrides: z.record(z.string(), z.string()).optional(),
});

export const importConfirmSchema = z.object({
  previewId: z.string().uuid(),
  forceReimport: z.boolean().default(false),
  rowEmployeeLinks: z.record(z.string(), z.string()).default({}),
  rowProjectDecisions: z
    .record(
      z.string(),
      z.object({
        action: z.enum(["use_existing", "create_project", "skip"]),
        projectName: z.string().optional(),
      }),
    )
    .default({}),
});

export const importUndoSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
