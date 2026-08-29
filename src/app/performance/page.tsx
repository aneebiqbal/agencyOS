"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/states";
import { ApiClientError, authJson } from "@/lib/client-api";
import { formatCurrencyCents, formatDate, formatPercent } from "@/lib/format";

interface PerformanceSnapshot {
  id: string;
  employeeUserId: string;
  periodStartUtc: string;
  periodEndUtc: string;
  utilizationPercent: number;
  onTimeDeliveryPercent: number;
  attributableRevenueCents: number;
}

export default function PerformancePage() {
  const [rows, setRows] = useState<PerformanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshots = await authJson<PerformanceSnapshot[]>("/api/performance/snapshots");
      setRows(snapshots);
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Unable to load performance metrics.");
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
    <ModuleShell title="Performance" description="Derived utilization, on-time delivery, and attributable revenue metrics.">
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading snapshots..." /> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState title="No snapshots available" guidance="Performance snapshots appear after scheduled analytics runs." />
      ) : null}
      {!loading && rows.length > 0 ? (
        <section className="card">
          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th className="pb-2">Staff</th>
                <th className="pb-2">Period</th>
                <th className="pb-2">Utilization</th>
                <th className="pb-2">On-time</th>
                <th className="pb-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2">{row.employeeUserId}</td>
                  <td className="py-2">
                    {formatDate(row.periodStartUtc)} - {formatDate(row.periodEndUtc)}
                  </td>
                  <td className="num py-2">{formatPercent(row.utilizationPercent)}</td>
                  <td className="num py-2">{formatPercent(row.onTimeDeliveryPercent)}</td>
                  <td className="num py-2">{formatCurrencyCents(row.attributableRevenueCents)}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </ModuleShell>
  );
}
