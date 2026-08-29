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
  const activeProjects = projects.filter((project) => project.status === "active").length;
  const wonLeads = leads.filter((item) => item.stage === "won").length;

  return (
    <ModuleShell
      title="Operations Command Center"
      description="Run daily execution with a clear view of pipeline momentum, delivery load, cash movement, and team activity."
    >
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading dashboard metrics and activity..." /> : null}

      {!loading && finance ? (
        <section className="card overflow-hidden bg-gradient-to-r from-slate-50 via-white to-emerald-50">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Monthly Executive Snapshot</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{formatCurrencyCents(finance.netMarginCents)} net margin this month</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Revenue is at {formatCurrencyCents(finance.revenueInCents)} with payroll and approved operating expenses reflected in real time.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <Link href="/finance" className="btn text-center">
                Open finance command
              </Link>
              <Link href="/expenses" className="btn-secondary text-center">
                Review expense queue
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && finance ? (
        <section className="kpi-grid">
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
            <h2 className="text-sm font-semibold text-ink">Priority queue</h2>
            <Link href="/finance" className="text-sm text-accent hover:text-accent-strong">
              View full finance feed
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted">Use this list as your first review pass before assigning workstreams.</p>
          {!loading && leads.length === 0 && projects.length === 0 && expenses.length === 0 ? (
            <EmptyState
              title="No operating data yet"
              guidance="Start by adding a lead, then convert it to a project so time and expense tracking can begin."
            />
          ) : (
            <div className="mt-3 grid gap-2 text-sm">
              <div className="card-muted flex items-center justify-between">
                <span>Open leads requiring qualification</span>
                <span className="num font-semibold">{openLeads}</span>
              </div>
              <div className="card-muted flex items-center justify-between">
                <span>Submitted expenses awaiting review</span>
                <span className="num font-semibold">{pendingExpenses}</span>
              </div>
              <div className="card-muted flex items-center justify-between">
                <span>Active projects in delivery</span>
                <span className="num font-semibold">{activeProjects}</span>
              </div>
              <div className="card-muted flex items-center justify-between">
                <span>Won leads ready for kickoff controls</span>
                <span className="num font-semibold">{wonLeads}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          <p className="mt-1 text-xs text-muted">Immutable audit events from finance, staffing, project, and sales updates.</p>
          {!loading && audit.length === 0 ? (
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Project queue preview</h2>
          <Link href="/projects" className="btn-secondary">
            Open project workspace
          </Link>
        </div>
        {!loading && projects.length === 0 ? (
          <EmptyState title="No projects to display" guidance="Create or convert a lead to start delivery tracking." />
        ) : !loading ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {projects.slice(0, 6).map((project) => (
              <Link
                key={project.id}
                href="/projects"
                className="rounded-md border border-border bg-muted px-3 py-3 text-sm transition hover:-translate-y-0.5 hover:bg-white"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{project.clientName}</span>
                  <StatusBadge status={project.status} />
                </div>
                <p className="mt-1 text-xs text-muted">Project ID: {project.id}</p>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </ModuleShell>
  );
}
