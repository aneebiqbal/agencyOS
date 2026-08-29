"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authJson } from "@/lib/client-api";
import { formatCurrencyCents, formatDateTime } from "@/lib/format";

interface Lead {
  id: string;
  stage: string;
}

interface Project {
  id: string;
  clientName: string;
  status: string;
}

interface Expense {
  id: string;
  status: string;
  amountCents: number;
}

interface FinanceSummary {
  revenueInCents: number;
  payrollOutCents: number;
  expenseOutCents: number;
  netMarginCents: number;
}

interface AuditLog {
  id: string;
  action: string;
  timestampUtc: string;
}

function monthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return {
    fromUtc: from.toISOString(),
    toUtc: to.toISOString(),
  };
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [audit, setAudit] = useState<AuditLog[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const range = monthRange();
          const [leadRows, projectRows, expenseRows, financeRow, auditRows] = await Promise.all([
            authJson<Lead[]>("/api/leads"),
            authJson<Project[]>("/api/projects"),
            authJson<Expense[]>("/api/expenses/list"),
            authJson<FinanceSummary>(
              `/api/finance/summary?fromUtc=${encodeURIComponent(range.fromUtc)}&toUtc=${encodeURIComponent(range.toUtc)}`,
            ),
            authJson<AuditLog[]>("/api/audit-logs"),
          ]);
          setLeads(leadRows);
          setProjects(projectRows);
          setExpenses(expenseRows);
          setFinance(financeRow);
          setAudit(auditRows.slice(0, 5));
          setLoading(false);
        } catch (cause) {
          setError(cause instanceof ApiClientError ? cause.message : "Could not load dashboard data.");
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const pendingExpenses = expenses.filter((item) => item.status === "submitted").length;
  const openLeads = leads.filter((item) => item.stage !== "won" && item.stage !== "lost").length;

  return (
    <ModuleShell
      title="Operations Dashboard"
      description="Daily control panel for pipeline, delivery, cash position, and operational risk signals."
    >
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading dashboard metrics and activity..." /> : null}

      {!loading && finance ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Revenue (month)", formatCurrencyCents(finance.revenueInCents)],
            ["Payroll cost", formatCurrencyCents(finance.payrollOutCents)],
            ["Expense outflow", formatCurrencyCents(finance.expenseOutCents)],
            ["Net margin", formatCurrencyCents(finance.netMarginCents)],
          ].map(([label, value]) => (
            <div key={label} className="card">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">{label}</p>
              <p className="num mt-2 text-[28px] font-semibold text-ink">{value}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">What needs attention today</h2>
            <Link href="/finance" className="text-sm text-accent hover:text-accent-strong">
              Open finance
            </Link>
          </div>
          {!loading && leads.length === 0 && projects.length === 0 && expenses.length === 0 ? (
            <EmptyState
              title="No operating data yet"
              guidance="Start by adding a lead, then convert it to a project so time and expense tracking can begin."
            />
          ) : (
            <div className="mt-3 grid gap-2 text-sm">
              <div className="card-muted flex items-center justify-between">
                <span>Open leads</span>
                <span className="num font-semibold">{openLeads}</span>
              </div>
              <div className="card-muted flex items-center justify-between">
                <span>Pending expenses</span>
                <span className="num font-semibold">{pendingExpenses}</span>
              </div>
              <div className="card-muted flex items-center justify-between">
                <span>Active projects</span>
                <span className="num font-semibold">{projects.filter((p) => p.status === "active").length}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          {audit.length === 0 ? (
            <EmptyState title="No audit activity yet" guidance="Actions appear here after writes to operational records." />
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              {audit.map((entry) => (
                <div key={entry.id} className="card-muted flex items-center justify-between">
                  <span>{entry.action}</span>
                  <span className="text-xs text-muted">{formatDateTime(entry.timestampUtc)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="text-sm font-semibold text-ink">Quick records</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {projects.slice(0, 6).map((project) => (
            <Link
              key={project.id}
              href="/projects"
              className="rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-white"
            >
              <div className="flex items-center justify-between">
                <span>{project.clientName}</span>
                <StatusBadge status={project.status} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </ModuleShell>
  );
}
