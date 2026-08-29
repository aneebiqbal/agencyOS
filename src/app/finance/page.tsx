"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/states";
import { ApiClientError, authJson } from "@/lib/client-api";
import { formatCurrencyCents, formatDateTime } from "@/lib/format";

interface FinanceSummary {
  periodStartUtc: string;
  periodEndUtc: string;
  revenueInCents: number;
  payrollOutCents: number;
  expenseOutCents: number;
  netMarginCents: number;
}

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  timestampUtc: string;
}

function monthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export default function FinancePage() {
  const bounds = monthBounds();
  const [fromDate, setFromDate] = useState(bounds.from);
  const [toDate, setToDate] = useState(bounds.to);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fromUtc = `${fromDate}T00:00:00.000Z`;
      const toUtc = `${toDate}T23:59:59.999Z`;
      const [summaryData, logsData] = await Promise.all([
        authJson<FinanceSummary>(`/api/finance/summary?fromUtc=${encodeURIComponent(fromUtc)}&toUtc=${encodeURIComponent(toUtc)}`),
        authJson<AuditLog[]>("/api/audit-logs"),
      ]);
      setSummary(summaryData);
      setAuditLogs(logsData.slice(0, 8));
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Unable to load finance dashboard.");
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refresh]);

  const kpis = summary
    ? [
        { label: "Revenue in", value: summary.revenueInCents, tone: "status-success" },
        { label: "Payroll out", value: summary.payrollOutCents, tone: "status-warn" },
        { label: "Expense out", value: summary.expenseOutCents, tone: "status-info" },
        { label: "Net margin", value: summary.netMarginCents, tone: summary.netMarginCents >= 0 ? "status-success" : "status-danger" },
      ]
    : [];
  const marginRate = summary && summary.revenueInCents > 0 ? (summary.netMarginCents / summary.revenueInCents) * 100 : null;

  return (
    <ModuleShell title="Finance" description="Revenue, payroll outflow, expense outflow, and net margin with recent immutable audit context.">
      {error ? <ErrorState message={error} /> : null}

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Reporting window</h3>
            <p className="mt-1 text-sm text-muted">Pick a period, refresh metrics, then review margin and audit events together.</p>
          </div>
          <span className="status-badge status-info">Monthly control</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="field text-sm">
            <span className="field-label">From</span>
            <input
              type="date"
              className="input"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="field text-sm">
            <span className="field-label">To</span>
            <input
              type="date"
              className="input"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            className="btn"
          >
            Refresh
          </button>
        </div>
      </section>

      {loading ? <LoadingState label="Loading finance metrics..." /> : null}
      {summary ? (
        <section className="kpi-grid">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="card">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-muted">{kpi.label}</p>
                <span className={`status-badge ${kpi.tone}`}>{kpi.label}</span>
              </div>
              <p className="num mt-2 text-2xl font-semibold text-ink">{formatCurrencyCents(kpi.value)}</p>
            </div>
          ))}
        </section>
      ) : null}

      {!loading && !summary ? (
        <EmptyState
          title="No finance summary returned"
          guidance="Adjust the reporting window and refresh to fetch finance metrics for the selected period."
        />
      ) : null}

      {summary ? (
        <section className="card">
          <h3 className="text-sm font-semibold text-ink">Margin interpretation</h3>
          <p className="mt-1 text-sm text-muted">
            Period: {formatDateTime(summary.periodStartUtc)} to {formatDateTime(summary.periodEndUtc)}.
          </p>
          <p className="mt-2 text-sm text-muted">
            {marginRate === null
              ? "Margin rate is unavailable because revenue is zero for this period."
              : `Net margin rate: ${marginRate.toFixed(1)}%. Use this with payroll and expense outflow to diagnose profitability pressure.`}
          </p>
        </section>
      ) : null}

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Recent audit events</h3>
            <p className="mt-1 text-sm text-muted">Review immutable changes that can explain unusual shifts in metrics.</p>
          </div>
          <span className="status-badge status-muted">Last 8 records</span>
        </div>

        {loading ? <LoadingState label="Loading audit trail..." /> : null}
        {!loading && auditLogs.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No audit entries found" guidance="Operational mutations create immutable audit log records." />
          </div>
        ) : null}
        {auditLogs.length > 0 ? (
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th className="pb-2">When</th>
                  <th className="pb-2">Action</th>
                  <th className="pb-2">Entity</th>
                  <th className="pb-2">ID</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2">{formatDateTime(entry.timestampUtc)}</td>
                    <td className="py-2">{entry.action}</td>
                    <td className="py-2">{entry.entity}</td>
                    <td className="py-2 font-mono text-xs">{entry.entityId}</td>
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
