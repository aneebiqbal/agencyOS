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

  return (
    <div className="select-none" onContextMenu={(event) => event.preventDefault()}>
      <ModuleShell title="Payroll (Provider Sync)" description="Read-only payroll run totals to keep statutory tax logic in Gusto/Deel/Rippling and out of local code.">
        {error ? <ErrorState message={error} /> : null}
        {loading ? <LoadingState label="Loading payroll runs..." /> : null}
        {!loading && runs.length === 0 ? (
          <EmptyState title="No payroll runs found" guidance="Payroll runs sync from your connected provider integration." />
        ) : null}
        {!loading && runs.length > 0 ? (
          <section className="card">
            <div className="table-wrap">
              <table className="table">
              <thead>
                <tr>
                  <th className="pb-2">Period</th>
                  <th className="pb-2">Provider Ref</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="py-2">
                      {formatDate(run.periodStartUtc)} - {formatDate(run.periodEndUtc)}
                    </td>
                    <td className="py-2">{run.providerRefId}</td>
                    <td className="py-2"><StatusBadge status={run.status} /></td>
                    <td className="num py-2">{formatCurrencyCents(run.totalCostCents)}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </ModuleShell>
      <SensitiveViewGuard />
    </div>
  );
}
