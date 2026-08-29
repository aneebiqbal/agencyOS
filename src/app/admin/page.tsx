"use client";

import { useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
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
  const [noticePublishing, setNoticePublishing] = useState(false);
  const [form, setForm] = useState({
    userId: "",
    role: "hr",
    email: "",
    fullName: "",
  });
  const [noticeForm, setNoticeForm] = useState({
    version: "v1",
    noticeText:
      "I acknowledge that all client, employee, financial, and project information in Agency OS is confidential and must only be used for authorized business purposes.",
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

  async function publishNotice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shouldContinue = window.confirm(`Publish confidentiality notice version ${noticeForm.version}?`);
    if (!shouldContinue) {
      return;
    }

    setNoticePublishing(true);
    setError(null);
    setResult(null);
    try {
      await authJson("/api/admin/confidentiality-notice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(noticeForm),
      });
      setResult(`Published confidentiality notice ${noticeForm.version}.`);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Failed to publish confidentiality notice.");
    }
    setNoticePublishing(false);
  }

  return (
    <ModuleShell title="Admin Provisioning" description="Owner-only provisioning for core HR/CTO accounts. Backend blocks invalid roles and a fourth account.">
      {error ? <ErrorState message={error} /> : null}
      {result ? <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{result}</p> : null}

      {me && me.role !== "owner" ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          This screen is owner-only. Current role: {me.role}
        </p>
      ) : null}

      {!me ? <LoadingState label="Loading owner context..." /> : null}

      {me?.role === "owner" ? (
        <section className="card">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Provision core account</h3>
            <StatusBadge status={me.role} />
          </div>
          <form onSubmit={provision} className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="field">
              <span className="field-label">Auth user ID</span>
              <input
                className="input"
                placeholder="f0099305-0bb5-43b5-8805-..."
                value={form.userId}
                onChange={(event) => setForm({ ...form, userId: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Role</span>
              <select
                className="select"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                <option value="hr">hr</option>
                <option value="cto">cto</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                className="input"
                placeholder="hr@startup.com"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Full name</span>
              <input
                className="input"
                placeholder="HR Lead"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                required
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="btn"
              >
                {submitting ? "Provisioning..." : "Provision account"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {me?.role === "owner" ? (
        <section className="card">
          <h3 className="text-sm font-semibold text-ink">Publish confidentiality notice</h3>
          <p className="mt-1 text-xs text-muted">
            Required before non-admin modules can be accessed.
          </p>
          <form onSubmit={publishNotice} className="mt-3 grid gap-3">
            <input
              className="input"
              placeholder="Version (example: v1 or 2026-09-policy)"
              value={noticeForm.version}
              onChange={(event) => setNoticeForm({ ...noticeForm, version: event.target.value })}
              required
            />
            <textarea
              className="textarea"
              placeholder="Notice text"
              value={noticeForm.noticeText}
              onChange={(event) => setNoticeForm({ ...noticeForm, noticeText: event.target.value })}
              required
            />
            <div>
              <button
                type="submit"
                disabled={noticePublishing}
                className="btn"
              >
                {noticePublishing ? "Publishing..." : "Publish notice"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </ModuleShell>
  );
}
