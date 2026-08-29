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
      <div className="grid w-full gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:p-6">
        <aside className="card h-fit lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Agency OS</p>
            <Link href="/" className="text-xs text-accent hover:text-accent-strong">
              Home
            </Link>
          </div>

          <div className="mt-3 grid gap-3 lg:gap-4">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{section.label}</p>
                <nav className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0">
                  {section.items.map(([label, href]) => {
                    const active = pathname === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`whitespace-nowrap rounded-md px-3 py-2 text-sm transition ${
                          active
                            ? "bg-primary/12 text-primary shadow-[inset_0_0_0_1px_var(--color-primary-strong)]"
                            : "text-muted hover:bg-muted"
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </aside>

        <main className="grid min-w-0 gap-4">
          <section className="card flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[24px] font-semibold tracking-tight text-ink">{title}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{description}</p>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <SessionControls />
              {actions ?? null}
            </div>
          </section>

          <section className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="card-muted">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Playbook</p>
              <h2 className="mt-1 text-base font-semibold text-ink">{playbook.title}</h2>
              <ol className="mt-2 grid gap-1 text-sm text-muted">
                {playbook.steps.map((step, index) => (
                  <li key={step}>
                    <span className="mr-2 num text-xs text-ink">0{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div className="card-muted">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Quick Actions</p>
              <div className="mt-2 flex flex-wrap gap-2">
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
