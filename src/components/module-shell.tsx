"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SessionControls } from "@/components/session-controls";

const NAV_SECTIONS = [
  {
    label: "Operate",
    items: [
      ["Dashboard", "/"],
      ["Sales", "/sales"],
      ["Projects", "/projects"],
      ["Employees", "/employees"],
      ["Time", "/time"],
      ["Expenses", "/expenses"],
      ["Invoicing", "/invoicing"],
    ],
  },
  {
    label: "Finance",
    items: [
      ["Finance", "/finance"],
      ["Payroll", "/payroll"],
      ["Performance", "/performance"],
      ["Imports", "/imports"],
    ],
  },
  {
    label: "Admin",
    items: [
      ["Profile", "/profile"],
      ["Admin", "/admin"],
    ],
  },
] as const;

const PAGE_PLAYBOOK: Record<string, { title: string; steps: string[]; actions: Array<{ label: string; href: string }> }> = {
  "/": {
    title: "Daily Operator Loop",
    steps: ["Check alerts and pending approvals", "Review cash, payroll, and run-rate", "Resolve one blocker in each team"],
    actions: [
      { label: "Review Finance", href: "/finance" },
      { label: "Open Expenses", href: "/expenses" },
    ],
  },
  "/sales": {
    title: "Revenue Engine",
    steps: ["Capture inbound and outbound leads", "Qualify and estimate deal value", "Convert won deals into projects"],
    actions: [
      { label: "Create Lead", href: "/sales" },
      { label: "Open Projects", href: "/projects" },
    ],
  },
  "/projects": {
    title: "Delivery Control",
    steps: ["Validate project budgets", "Check manager ownership", "Track staffing and status drift"],
    actions: [
      { label: "Log Time", href: "/time" },
      { label: "Open Performance", href: "/performance" },
    ],
  },
  "/employees": {
    title: "People Operations",
    steps: ["Add employee record", "Set salary or hourly rate", "Use employee IDs in time and expenses"],
    actions: [
      { label: "Open Payroll", href: "/payroll" },
      { label: "Open Performance", href: "/performance" },
    ],
  },
  "/finance": {
    title: "Finance Command",
    steps: ["Set reporting window", "Check margin pressure", "Scan audit events for anomalies"],
    actions: [
      { label: "Review Payroll", href: "/payroll" },
      { label: "Open Invoicing", href: "/invoicing" },
    ],
  },
};

interface ModuleShellProps {
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function ModuleShell({ title, description, actions, children }: ModuleShellProps) {
  const pathname = usePathname();
  const playbook = PAGE_PLAYBOOK[pathname] ?? {
    title: "Module Playbook",
    steps: ["Review current queue", "Complete required actions", "Record next follow-up decision"],
    actions: [{ label: "Back to Dashboard", href: "/" }],
  };

  return (
    <div className="app-bg min-h-screen">
      <div className="mx-auto grid w-full max-w-[1500px] gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5 lg:p-6">
        <aside className="card shell-sidebar h-fit lg:sticky lg:top-6 lg:self-start">
          <div className="shell-brand">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Agency OS</p>
                <p className="mt-1 text-base font-semibold tracking-tight text-ink">Operations Console</p>
              </div>
              <Link href="/" className="btn-secondary px-3 py-1.5 text-[12px]">
                Home
              </Link>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">One control plane for revenue, delivery, finance, and people operations.</p>
          </div>

          <div className="hidden rounded-xl border border-border/90 bg-white/70 p-3 lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Current Module</p>
            <p className="mt-1 text-sm font-semibold text-ink">{title}</p>
          </div>

          <div className="grid gap-3 lg:gap-4">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label}>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{section.label}</p>
                <nav className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0">
                  {section.items.map(([label, href]) => {
                    const active = pathname === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`shell-nav-link whitespace-nowrap ${active ? "shell-nav-link-active" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        <span>{label}</span>
                        {active ? <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">On</span> : null}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </aside>

        <main className="grid min-w-0 gap-4">
          <section className="card flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Module Overview</p>
              <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
            </div>
            <div className="flex w-full flex-col items-start gap-3 md:w-auto md:items-end">
              <SessionControls />
              {actions ?? null}
            </div>
          </section>

          <section className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="card-muted">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Playbook</p>
              <h2 className="mt-1 text-base font-semibold text-ink">{playbook.title}</h2>
              <ol className="mt-3 grid gap-2 text-sm text-muted">
                {playbook.steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-2">
                    <span className="num mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border bg-white px-1 text-[11px] font-semibold text-ink">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="leading-5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="card-muted">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Quick Actions</p>
              <p className="mt-1 text-sm text-muted">Jump directly into key workstreams for this module.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {playbook.actions.map((actionItem) => (
                  <Link key={actionItem.href + actionItem.label} href={actionItem.href} className="btn-secondary">
                    {actionItem.label}
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {children}
        </main>
      </div>
    </div>
  );
}
