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

interface StaffMember {
  staffId: string;
  fullName: string;
}

export default function PerformancePage() {
  const [rows, setRows] = useState<PerformanceSnapshot[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const staffById = new Map(staff.map((member) => [member.staffId, member.fullName]));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [snapshots, staffMembers] = await Promise.all([
        authJson<PerformanceSnapshot[]>("/api/performance/snapshots"),
        authJson<StaffMember[]>("/api/staff-members"),
      ]);
      setRows(snapshots);
      setStaff(staffMembers);
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

  const averageUtilization =
    rows.length > 0 ? rows.reduce((total, row) => total + row.utilizationPercent, 0) / rows.length : 0;
  const averageOnTime = rows.length > 0 ? rows.reduce((total, row) => total + row.onTimeDeliveryPercent, 0) / rows.length : 0;
  const totalRevenueCents = rows.reduce((total, row) => total + row.attributableRevenueCents, 0);
  const topPerformer = rows.reduce<PerformanceSnapshot | null>((top, row) => {
    if (!top) {
      return row;
    }
    return row.attributableRevenueCents > top.attributableRevenueCents ? row : top;
  }, null);

  return (
    <ModuleShell title="Performance" description="Derived utilization, on-time delivery, and attributable revenue metrics.">
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading snapshots..." /> : null}

      {!loading && rows.length > 0 ? (
        <section className="kpi-grid">
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-muted">Average utilization</p>
            <p className="num mt-2 text-2xl font-semibold text-ink">{formatPercent(averageUtilization)}</p>
          </div>
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-muted">Average on-time delivery</p>
            <p className="num mt-2 text-2xl font-semibold text-ink">{formatPercent(averageOnTime)}</p>
          </div>
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-muted">Attributable revenue</p>
            <p className="num mt-2 text-2xl font-semibold text-ink">{formatCurrencyCents(totalRevenueCents)}</p>
          </div>
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-muted">Top revenue contributor</p>
            <p className="mt-2 text-base font-semibold text-ink">{topPerformer ? (staffById.get(topPerformer.employeeUserId) ?? "Unknown staff") : "-"}</p>
            {topPerformer ? <p className="font-mono text-xs text-muted">{topPerformer.employeeUserId}</p> : null}
          </div>
        </section>
      ) : null}

      {!loading && rows.length === 0 ? (
        <EmptyState title="No snapshots available" guidance="Performance snapshots appear after scheduled analytics runs." />
      ) : null}
      {!loading && rows.length > 0 ? (
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Snapshot register</h3>
              <p className="mt-1 text-sm text-muted">Compare utilization, delivery reliability, and attributable revenue per team member.</p>
            </div>
            <span className="status-badge status-info">Analytics output</span>
          </div>

          <div className="table-wrap mt-3">
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
                    <td className="py-2">
                      <p className="font-medium text-ink">{staffById.get(row.employeeUserId) ?? "Unknown staff"}</p>
                      <p className="font-mono text-xs text-muted">{row.employeeUserId}</p>
                    </td>
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
