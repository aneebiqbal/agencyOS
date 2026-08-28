import Link from "next/link";

export default function Home() {
  return (
    <div className="page-bg min-h-screen p-6 md:p-12">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm md:p-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wider text-accent">AGENCY OS</p>
            <h1 className="text-3xl font-semibold tracking-tight">MVP Control Center</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-700">
              Boilerplate for sales, projects, time, expenses, invoicing, finance, payroll sync, performance,
              and immutable audit trails.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-soft px-4 py-3 text-sm text-zinc-700">
            No direct disbursement flows are enabled in this phase.
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Sales", "/sales"],
            ["Projects", "/projects"],
            ["Time", "/time"],
            ["Expenses", "/expenses"],
            ["Invoicing", "/invoicing"],
            ["Finance", "/finance"],
            ["Payroll", "/payroll"],
            ["Performance", "/performance"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-border bg-white px-4 py-4 text-sm font-medium transition hover:-translate-y-0.5 hover:border-accent hover:shadow-sm"
            >
              {label}
            </Link>
          ))}
        </section>

        <section className="rounded-2xl border border-border bg-surface-soft p-4">
          <h2 className="text-base font-semibold">Security assumptions in this boilerplate</h2>
          <ul className="mt-2 space-y-2 text-sm text-zinc-700">
            <li>Auth is header-based mock (`x-user-id`, `x-user-role`) and must be replaced by Supabase/Clerk.</li>
            <li>All write APIs are rate-limited and audit-logged.</li>
            <li>Payroll route is read-only summary sync by design.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
