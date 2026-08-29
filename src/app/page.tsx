import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agency OS | Revenue to Cash Operations Platform",
  description:
    "Agency OS unifies sales pipeline, project delivery, time, expenses, invoicing, and executive finance visibility for modern service companies.",
  openGraph: {
    title: "Agency OS",
    description:
      "One operating system for service-company growth: capture demand, run delivery, and close revenue into cash with full control.",
    type: "website",
  },
};

const JOURNEY_STEPS = [
  {
    title: "Capture demand",
    text: "Sales teams track leads, qualify pipeline, and convert won opportunities into project-ready delivery plans.",
  },
  {
    title: "Run delivery",
    text: "Operations teams manage staffing, project budgets, and timeline drift across active client work.",
  },
  {
    title: "Close the loop",
    text: "Finance teams automate invoicing, approvals, payroll context, and margin visibility from one control surface.",
  },
] as const;

const PROOF_POINTS = [
  "Real-time KPI and audit visibility",
  "Strict role model with core-account provisioning",
  "Built-in financial controls and approval guardrails",
  "Unified execution across revenue, delivery, and cash",
] as const;

export default function LandingPage() {
  return (
    <div className="app-bg min-h-screen">
      <main className="mx-auto w-full max-w-[1300px] px-4 py-5 md:px-6 md:py-8">
        <section className="card overflow-hidden border-border/80 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 text-slate-50">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">Agency OS</p>
              <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight tracking-[-0.03em] md:text-5xl">
                The operating system for modern service companies.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
                Replace fragmented spreadsheets and disconnected tools with one command layer for pipeline, projects, people, expenses,
                invoicing, payroll context, and executive visibility.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href="/login?mode=demo&next=%2Fworkspace%3Fdemo%3D1" className="btn">
                  Book live demo access
                </Link>
                <Link href="/workspace" className="btn-secondary border-white/35 bg-white/10 text-white hover:bg-white/20">
                  Enter workspace
                </Link>
              </div>
            </div>

            <div className="grid gap-2 text-sm">
              {PROOF_POINTS.map((item) => (
                <div key={item} className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 backdrop-blur-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-3 md:grid-cols-3">
          {JOURNEY_STEPS.map((step, index) => (
            <article key={step.title} className="card">
              <p className="num text-xs uppercase tracking-[0.1em] text-muted">0{index + 1}</p>
              <h2 className="mt-2 text-lg font-semibold text-ink">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{step.text}</p>
            </article>
          ))}
        </section>

        <section className="mt-4 card grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Investor Narrative</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">One platform. One data model. One execution rhythm.</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Agency OS turns service operations into a measurable system: demand intake, delivery execution, and financial outcomes all
              roll up in real time.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/70 p-4">
            <p className="text-sm font-semibold text-ink">Ready for the walkthrough?</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Sign in to run the full demo path: lead capture, deal conversion, project staffing, invoice issue, and paid-state closeout.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/login?mode=demo&next=%2Fworkspace%3Fdemo%3D1" className="btn">
                Open operator login
              </Link>
              <Link href="/workspace" className="btn-secondary">
                Go to dashboard
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
