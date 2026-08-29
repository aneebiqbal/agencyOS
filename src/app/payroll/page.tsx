"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { SensitiveViewGuard } from "@/components/sensitive-view-guard";
import { ApiClientError, authJson } from "@/lib/client-api";

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
      <ModuleShell
        title="Payroll (Provider Sync)"
        description="Read-only payroll run totals to keep statutory tax logic in Gusto/Deel/Rippling and out of local code."
        endpoints={["GET /api/payroll/runs"]}
      >
        {error ? <p className="rounded-md border border-danger/40 bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
        {loading ? <p className="text-sm text-zinc-600">Loading payroll runs...</p> : null}
        {!loading && runs.length === 0 ? <p className="text-sm text-zinc-600">No payroll runs found.</p> : null}
        {!loading && runs.length > 0 ? (
          <section className="rounded-xl border border-border bg-white p-4">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-zinc-600">
                  <th className="pb-2">Period</th>
                  <th className="pb-2">Provider Ref</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-border/60">
                    <td className="py-2">
                      {run.periodStartUtc.slice(0, 10)} - {run.periodEndUtc.slice(0, 10)}
                    </td>
                    <td className="py-2">{run.providerRefId}</td>
                    <td className="py-2">{run.status}</td>
                    <td className="py-2">${(run.totalCostCents / 100).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </ModuleShell>
      <SensitiveViewGuard />
    </div>
  );
}
