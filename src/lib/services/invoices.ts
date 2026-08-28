import { randomUUID } from "node:crypto";

import type { DataStore } from "@/lib/db/store";
import { badRequest, notFound } from "@/lib/domain/errors";
import { calculateInvoiceTotals } from "@/lib/domain/invoice";
import { decimalToCents } from "@/lib/domain/money";
import type { Invoice, InvoiceLineItem, SessionUser } from "@/lib/domain/types";

interface GeneratedInvoiceResult {
  invoice: Invoice;
  sendQueued: boolean;
  sendError: string | null;
}

const INTERNAL_HOURLY_RATE_CENTS = decimalToCents(75);

export function generateInvoiceFromProjectTime(
  store: DataStore,
  actor: SessionUser,
  input: { projectId: string; dueDateUtc: string; taxRateBps: number },
): GeneratedInvoiceResult {
  const project = store
    .getState()
    .projects.find((item) => item.id === input.projectId && item.deletedAtUtc === null);

  if (!project) {
    throw notFound("Project not found.");
  }

  const eligibleEntries = store
    .getState()
    .timeEntries.filter(
      (entry) =>
        entry.projectId === input.projectId &&
        entry.billable &&
        entry.deletedAtUtc === null &&
        entry.billedInvoiceId === null,
    );

  if (eligibleEntries.length === 0) {
    throw badRequest("No billable, unbilled time entries found for this project.");
  }

  const lineItems: InvoiceLineItem[] = eligibleEntries.map((entry) => {
    const unitAmountCents = Math.floor(INTERNAL_HOURLY_RATE_CENTS / 100);
    const quantity = Math.round(entry.hours * 100);
    const lineTotalCents = quantity * unitAmountCents;
    return {
      description: `${entry.description} (${entry.hours}h)`,
      quantity,
      unitAmountCents,
      lineTotalCents,
    };
  });

  const totals = calculateInvoiceTotals(lineItems, input.taxRateBps);
  const now = new Date().toISOString();
  const invoiceId = randomUUID();

  const invoice: Invoice = {
    id: invoiceId,
    projectId: project.id,
    clientName: project.clientName,
    currency: "USD",
    lineItems,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    status: "approved",
    dueDateUtc: input.dueDateUtc,
    issuedAtUtc: now,
    createdByUserId: actor.userId,
    sendAttempts: 0,
    lastSendError: null,
    deletedAtUtc: null,
  };

  store.transaction((state) => {
    state.invoices.push(invoice);
    for (const entry of state.timeEntries) {
      if (eligibleEntries.some((e) => e.id === entry.id)) {
        entry.billedInvoiceId = invoiceId;
      }
    }
  });

  store.appendAuditLog(actor, "invoice.generate", "invoice", invoice.id, null, invoice);

  // Assumption: this phase stores invoice even when downstream delivery fails.
  const shouldSimulateSendFailure = project.clientName.toLowerCase().includes("fail-send");
  if (shouldSimulateSendFailure) {
    const sendError = "Invoice delivery provider unavailable.";
    const failedInvoice = store.transaction((state) => {
      const match = state.invoices.find((item) => item.id === invoice.id);
      if (!match) {
        throw notFound("Invoice not found for send status update.");
      }
      const before = structuredClone(match);
      match.status = "send_failed";
      match.sendAttempts += 1;
      match.lastSendError = sendError;
      return { after: structuredClone(match), before };
    });
    store.appendAuditLog(
      actor,
      "invoice.send.failed",
      "invoice",
      invoice.id,
      failedInvoice.before,
      failedInvoice.after,
    );
    return {
      invoice: failedInvoice.after,
      sendQueued: false,
      sendError,
    };
  }

  const sentInvoice = store.transaction((state) => {
    const match = state.invoices.find((item) => item.id === invoice.id);
    if (!match) {
      throw notFound("Invoice not found for send status update.");
    }
    const before = structuredClone(match);
    match.status = "sent";
    match.sendAttempts += 1;
    return { after: structuredClone(match), before };
  });

  store.appendAuditLog(
    actor,
    "invoice.send.success",
    "invoice",
    invoice.id,
    sentInvoice.before,
    sentInvoice.after,
  );

  return {
    invoice: sentInvoice.after,
    sendQueued: true,
    sendError: null,
  };
}
