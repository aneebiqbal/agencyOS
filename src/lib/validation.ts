import { z } from "zod";

const isoUtcDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const createLeadSchema = z.object({
  source: z.enum(["linkedin", "upwork", "gmail", "referral", "inbound-web", "outbound", "marketplace", "other"]),
  stage: z.enum(["new", "qualified", "proposal", "lost"]),
  valueEstimateCents: z.number().int().min(0).max(100_000_000),
  ownerUserId: z.string().min(1),
});

export const updateLeadStageSchema = z.object({
  stage: z.enum(["new", "qualified", "proposal", "won", "lost"]),
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
  category: z.enum(["rent", "software", "travel", "upwork", "ai_tools", "subscriptions", "other"]),
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

export const updateExpenseStatusSchema = z.object({
  status: z.enum(["submitted", "approved", "reimbursed"]),
});

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(["paid"]),
});

export const createStaffMemberSchema = z.object({
  staffId: z.string().trim().min(1).max(120),
  fullName: z.string().trim().min(1).max(120),
  externalCode: z.string().trim().max(120).optional(),
});

export const upsertStaffCompensationSchema = z
  .object({
    employmentType: z.enum(["full_time", "part_time", "contractor"]),
    annualSalaryCents: z.number().int().min(0).max(5_000_000_000).nullable().optional(),
    hourlyRateCents: z.number().int().min(0).max(5_000_000).nullable().optional(),
    currency: z.enum(["USD", "PKR"]).default("PKR"),
  })
  .superRefine((value, ctx) => {
    if (value.annualSalaryCents == null && value.hourlyRateCents == null) {
      ctx.addIssue({
        code: "custom",
        message: "Set annual salary or hourly rate.",
        path: ["annualSalaryCents"],
      });
    }
  });

export const publishConfidentialityNoticeSchema = z.object({
  version: z.string().trim().min(1).max(40),
  noticeText: z.string().trim().min(20).max(10_000),
});
