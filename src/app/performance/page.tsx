"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ApiClientError, authJson } from "@/lib/client-api";

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
    <ModuleShell
      title="Performance"
      description="Derived utilization, on-time delivery, and attributable revenue metrics."
      endpoints={["GET /api/performance/snapshots"]}
    >
      {error ? <p className="rounded-md border border-danger/40 bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-600">Loading snapshots...</p> : null}
      {!loading && rows.length === 0 ? <p className="text-sm text-zinc-600">No snapshots available.</p> : null}
      {!loading && rows.length > 0 ? (
        <section className="rounded-xl border border-border bg-white p-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-zinc-600">
                <th className="pb-2">Staff</th>
                <th className="pb-2">Period</th>
                <th className="pb-2">Utilization</th>
                <th className="pb-2">On-time</th>
                <th className="pb-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="py-2">{row.employeeUserId}</td>
                  <td className="py-2">
                    {row.periodStartUtc.slice(0, 10)} - {row.periodEndUtc.slice(0, 10)}
                  </td>
                  <td className="py-2">{row.utilizationPercent}%</td>
                  <td className="py-2">{row.onTimeDeliveryPercent}%</td>
                  <td className="py-2">${(row.attributableRevenueCents / 100).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </ModuleShell>
  );
}
