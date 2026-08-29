"use client";

import { useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ApiClientError, authJson } from "@/lib/client-api";

interface MeResponse {
  userId: string;
  role: "owner" | "hr" | "cto";
}

export default function AdminPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    userId: "",
    role: "hr",
    email: "",
    fullName: "",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void authJson<MeResponse>("/api/me")
        .then((data) => {
          setMe(data);
        })
        .catch((cause) => {
          setError(cause instanceof ApiClientError ? cause.message : "Failed to load current user.");
        });
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  async function provision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shouldContinue = window.confirm(`Provision ${form.role.toUpperCase()} account ${form.userId}?`);
    if (!shouldContinue) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      await authJson("/api/admin/provision-user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      setResult(`Provisioned ${form.userId} as ${form.role}.`);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Provisioning failed.");
    }
    setSubmitting(false);
  }

  return (
    <ModuleShell
      title="Admin Provisioning"
      description="Owner-only provisioning for core HR/CTO accounts. Backend blocks invalid roles and a fourth account."
      endpoints={["POST /api/admin/provision-user", "GET /api/me"]}
    >
      {error ? <p className="rounded-md border border-danger/40 bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      {result ? <p className="rounded-md border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900">{result}</p> : null}

      {me && me.role !== "owner" ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          This screen is owner-only. Current role: {me.role}
        </p>
      ) : null}

      {!me ? <p className="text-sm text-zinc-600">Loading owner context...</p> : null}

      {me?.role === "owner" ? (
        <section className="rounded-xl border border-border bg-white p-4">
          <h3 className="text-sm font-semibold">Provision core account</h3>
          <form onSubmit={provision} className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="rounded border border-border px-3 py-2 text-sm"
              placeholder="Auth user id"
              value={form.userId}
              onChange={(event) => setForm({ ...form, userId: event.target.value })}
              required
            />
            <select
              className="rounded border border-border px-3 py-2 text-sm"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
            >
              <option value="hr">hr</option>
              <option value="cto">cto</option>
            </select>
            <input
              type="email"
              className="rounded border border-border px-3 py-2 text-sm"
              placeholder="Email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
            <input
              className="rounded border border-border px-3 py-2 text-sm"
              placeholder="Full name"
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              required
            />
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Provisioning..." : "Provision account"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </ModuleShell>
  );
}
