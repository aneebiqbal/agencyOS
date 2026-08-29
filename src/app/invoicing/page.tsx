"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authJson } from "@/lib/client-api";
import { formatCurrencyCents, formatDate } from "@/lib/format";

interface Project {
  id: string;
  clientName: string;
}

interface Invoice {
  id: string;
  projectId: string;
  clientName: string;
  totalCents: number;
  status: string;
  sendAttempts: number;
  lastSendError: string | null;
  dueDateUtc: string;
}

const DEFAULT_INVOICE_DUE_DATE = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function InvoicingPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    projectId: "",
    dueDateUtc: DEFAULT_INVOICE_DUE_DATE,
    taxRateBps: "800",
  });

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectRows, invoiceRows] = await Promise.all([
        authJson<Project[]>("/api/projects"),
        authJson<Invoice[]>("/api/invoices"),
      ]);
      setProjects(projectRows);
      setInvoices(invoiceRows);
      setForm((current) => ({ ...current, projectId: current.projectId || projectRows[0]?.id || "" }));
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Unable to load invoicing data.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshData();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshData]);

  async function generateInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shouldContinue = window.confirm("Generate invoice from unbilled billable time for this project?");
    if (!shouldContinue) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await authJson("/api/invoices/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          dueDateUtc: `${form.dueDateUtc}T00:00:00.000Z`,
          taxRateBps: Number(form.taxRateBps),
        }),
      });
      await refreshData();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Invoice generation failed.");
    }
    setSubmitting(false);
  }

  async function retrySend(invoiceId: string) {
    const shouldContinue = window.confirm("Retry sending this failed invoice?");
    if (!shouldContinue) {
      return;
    }

    setError(null);
    try {
      await authJson(`/api/invoices/${invoiceId}/retry-send`, {
        method: "POST",
      });
      await refreshData();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Retry failed.");
    }
  }

  return (
    <ModuleShell title="Invoicing" description="Generate invoices and recover failed sends safely.">
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading invoice register..." /> : null}

      <section className="card">
        <h3 className="text-sm font-semibold text-ink">Generate invoice</h3>
        <form onSubmit={generateInvoice} className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="field">
            <span className="field-label">Project</span>
            <select
              className="select"
              value={form.projectId}
              onChange={(event) => setForm({ ...form, projectId: event.target.value })}
              required
            >
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.clientName} ({project.id})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Due date</span>
            <input
              type="date"
              className="input"
              value={form.dueDateUtc}
              onChange={(event) => setForm({ ...form, dueDateUtc: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Tax rate (bps)</span>
            <input
              type="number"
              min={0}
              max={10000}
              className="input num"
              value={form.taxRateBps}
              onChange={(event) => setForm({ ...form, taxRateBps: event.target.value })}
              required
            />
          </label>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={submitting}
              className="btn"
            >
              {submitting ? "Generating..." : "Generate invoice"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h3 className="text-sm font-semibold text-ink">Invoices</h3>
        {!loading && invoices.length === 0 ? (
          <EmptyState title="No invoices yet" guidance="Generate an invoice from project time entries above." />
        ) : null}
        {!loading && invoices.length > 0 ? (
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th className="pb-2">Invoice</th>
                  <th className="pb-2">Client</th>
                  <th className="pb-2">Total</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Due</th>
                  <th className="pb-2">Attempts</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="py-2 font-mono text-xs">{invoice.id}</td>
                    <td className="py-2">{invoice.clientName}</td>
                    <td className="num py-2">{formatCurrencyCents(invoice.totalCents)}</td>
                    <td className="py-2"><StatusBadge status={invoice.status} /></td>
                    <td className="py-2">{formatDate(invoice.dueDateUtc)}</td>
                    <td className="num py-2">{invoice.sendAttempts}</td>
                    <td className="py-2">
                      {invoice.status === "send_failed" ? (
                        <button
                          type="button"
                          onClick={() => {
                            void retrySend(invoice.id);
                          }}
                          className="btn-secondary px-2 py-1 text-xs"
                        >
                          Retry send
                        </button>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </ModuleShell>
  );
}
