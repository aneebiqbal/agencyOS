import Link from "next/link";
import type { ReactNode } from "react";
import { SessionControls } from "@/components/session-controls";

interface ModuleShellProps {
  title: string;
  description: string;
  endpoints: string[];
  children?: ReactNode;
}

export function ModuleShell({ title, description, endpoints, children }: ModuleShellProps) {
  return (
    <div className="page-bg min-h-screen p-6 md:p-12">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-2xl border border-border bg-surface p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-medium text-accent hover:text-accent-strong">
              Back to Home
            </Link>
            <SessionControls />
          </div>
        </div>

        <p className="text-sm leading-6 text-zinc-700">{description}</p>

        <section className="rounded-xl border border-border bg-surface-soft p-4">
          <h2 className="text-sm font-semibold">Connected API routes</h2>
          <ul className="mt-2 space-y-2 text-sm text-zinc-700">
            {endpoints.map((endpoint) => (
              <li key={endpoint}>
                <code>{endpoint}</code>
              </li>
            ))}
          </ul>
        </section>

        {children ?? null}
      </main>
    </div>
  );
}
