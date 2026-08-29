"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { SensitiveViewGuard } from "@/components/sensitive-view-guard";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authJson } from "@/lib/client-api";
import { formatCurrencyCents, formatDate } from "@/lib/format";

interface PayrollRun {
  id: string;
  periodStartUtc: string;
  periodEndUtc: string;
  providerRefId: string;
  status: string;
  totalCostCents: number;
}

export default function PayrollPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await authJson<PayrollRun[]>("/api/payroll/runs");
      setRuns(rows);
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Unable to load payroll runs.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [load]);

  const totalCostCents = runs.reduce((total, run) => total + run.totalCostCents, 0);
  const completedCount = runs.filter((run) => run.status === "completed").length;
  const pendingCount = runs.filter((run) => run.status !== "completed").length;

  return (
    <div className="select-none" onContextMenu={(event) => event.preventDefault()}>
      <ModuleShell title="Payroll (Provider Sync)" description="Read-only payroll run totals to keep statutory tax logic in Gusto/Deel/Rippling and out of local code.">
        {error ? <ErrorState message={error} /> : null}
        {loading ? <LoadingState label="Loading payroll runs..." /> : null}

        {!loading ? (
          <section className="kpi-grid">
            <div className="card">
              <p className="text-xs uppercase tracking-wide text-muted">Payroll runs</p>
              <p className="num mt-2 text-2xl font-semibold text-ink">{runs.length}</p>
            </div>
            <div className="card">
              <p className="text-xs uppercase tracking-wide text-muted">Completed</p>
              <p className="num mt-2 text-2xl font-semibold text-ink">{completedCount}</p>
            </div>
            <div className="card">
              <p className="text-xs uppercase tracking-wide text-muted">Pending or in-progress</p>
              <p className="num mt-2 text-2xl font-semibold text-ink">{pendingCount}</p>
            </div>
            <div className="card">
              <p className="text-xs uppercase tracking-wide text-muted">Total synced cost</p>
              <p className="num mt-2 text-2xl font-semibold text-ink">{formatCurrencyCents(totalCostCents)}</p>
            </div>
          </section>
        ) : null}

        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Provider run register</h3>
              <p className="mt-1 text-sm text-muted">Use this view to reconcile payroll cycles and confirm provider sync health.</p>
            </div>
            <span className="status-badge status-info">Read-only source</span>
          </div>

          {loading ? <LoadingState label="Syncing payroll register..." /> : null}
          {!loading && runs.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No payroll runs found" guidance="Payroll runs sync from your connected provider integration." />
            </div>
          ) : null}
          {!loading && runs.length > 0 ? (
            <div className="table-wrap mt-3">
              <table className="table">
                <thead>
                  <tr>
                    <th className="pb-2">Run ID</th>
                    <th className="pb-2">Period</th>
                    <th className="pb-2">Provider Ref</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="py-2 font-mono text-xs">{run.id}</td>
                      <td className="py-2">
                        {formatDate(run.periodStartUtc)} - {formatDate(run.periodEndUtc)}
                      </td>
                      <td className="py-2 font-mono text-xs">{run.providerRefId}</td>
                      <td className="py-2"><StatusBadge status={run.status} /></td>
                      <td className="num py-2">{formatCurrencyCents(run.totalCostCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </ModuleShell>
      <SensitiveViewGuard />
    </div>
  );
}
