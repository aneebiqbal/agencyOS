"use client";

import { useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authJson } from "@/lib/client-api";
import { getMeCached } from "@/lib/client-me";
import { formatCurrencyCents } from "@/lib/format";

interface MeResponse {
  userId: string;
  role: "owner" | "hr" | "cto";
}

interface StaffDirectoryRow {
  staffId: string;
  fullName: string;
  externalCode: string | null;
  employmentType: "full_time" | "part_time" | "contractor" | null;
  annualSalaryCents: number | null;
  hourlyRateCents: number | null;
  currency: "USD";
  updatedAtUtc: string | null;
}

export default function AdminPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const [compSubmitting, setCompSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [noticePublishing, setNoticePublishing] = useState(false);
  const [staffRows, setStaffRows] = useState<StaffDirectoryRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
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
  const [staffForm, setStaffForm] = useState({
    staffId: "",
    fullName: "",
    externalCode: "",
  });
  const [compForm, setCompForm] = useState({
    staffId: "",
    employmentType: "full_time",
    annualSalaryCents: "",
    hourlyRateCents: "",
  });

  async function refreshStaffDirectory() {
    setStaffLoading(true);
    try {
      const rows = await authJson<StaffDirectoryRow[]>("/api/staff-directory");
      setStaffRows(rows);
      setCompForm((current) => ({
        ...current,
        staffId: current.staffId || rows[0]?.staffId || "",
      }));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Failed to load staff directory.");
    }
    setStaffLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void getMeCached()
        .then((data) => {
          setMe(data);
          if (data.role === "owner" || data.role === "hr") {
            void refreshStaffDirectory();
          }
        })
        .catch((cause) => {
          setError(cause instanceof ApiClientError ? cause.message : "Failed to load current user.");
          setStaffLoading(false);
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

  async function addStaffMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStaffSubmitting(true);
    setError(null);
    setResult(null);
    try {
      await authJson("/api/staff-members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(staffForm),
      });
      setResult(`Added staff member ${staffForm.fullName} (${staffForm.staffId}).`);
      setStaffForm({ staffId: "", fullName: "", externalCode: "" });
      await refreshStaffDirectory();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Failed to add staff member.");
    }
    setStaffSubmitting(false);
  }

  async function saveCompensation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!compForm.staffId) {
      setError("Choose a staff member first.");
      return;
    }

    setCompSubmitting(true);
    setError(null);
    setResult(null);
    try {
      await authJson(`/api/staff-members/${encodeURIComponent(compForm.staffId)}/compensation`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employmentType: compForm.employmentType,
          annualSalaryCents: compForm.annualSalaryCents ? Number(compForm.annualSalaryCents) : null,
          hourlyRateCents: compForm.hourlyRateCents ? Number(compForm.hourlyRateCents) : null,
          currency: "USD",
        }),
      });
      setResult(`Saved compensation for ${compForm.staffId}.`);
      await refreshStaffDirectory();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Failed to save compensation.");
    }
    setCompSubmitting(false);
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

      {me && (me.role === "owner" || me.role === "hr") ? (
        <section className="grid gap-3 xl:grid-cols-2">
          <form className="card grid gap-3" onSubmit={addStaffMember}>
            <h3 className="text-sm font-semibold text-ink">Add employee record</h3>
            <p className="text-xs text-muted">This creates a staff member for time, expenses, payroll, and reporting.</p>
            <label className="field">
              <span className="field-label">Staff ID</span>
              <input
                className="input"
                value={staffForm.staffId}
                onChange={(event) => setStaffForm({ ...staffForm, staffId: event.target.value })}
                placeholder="staff-1001"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Full name</span>
              <input
                className="input"
                value={staffForm.fullName}
                onChange={(event) => setStaffForm({ ...staffForm, fullName: event.target.value })}
                placeholder="Avery Stone"
                required
              />
            </label>
            <label className="field">
              <span className="field-label">External code (optional)</span>
              <input
                className="input"
                value={staffForm.externalCode}
                onChange={(event) => setStaffForm({ ...staffForm, externalCode: event.target.value })}
                placeholder="EMP-1001"
              />
            </label>
            <div>
              <button type="submit" className="btn" disabled={staffSubmitting}>
                {staffSubmitting ? "Adding..." : "Add employee"}
              </button>
            </div>
          </form>

          <form className="card grid gap-3" onSubmit={saveCompensation}>
            <h3 className="text-sm font-semibold text-ink">Set salary / compensation</h3>
            <p className="text-xs text-muted">Supports annual salary and contractor hourly rates.</p>
            <label className="field">
              <span className="field-label">Staff member</span>
              <select
                className="select"
                value={compForm.staffId}
                onChange={(event) => setCompForm({ ...compForm, staffId: event.target.value })}
                required
              >
                <option value="">Select staff</option>
                {staffRows.map((row) => (
                  <option key={row.staffId} value={row.staffId}>
                    {row.fullName} ({row.staffId})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Employment type</span>
              <select
                className="select"
                value={compForm.employmentType}
                onChange={(event) => setCompForm({ ...compForm, employmentType: event.target.value })}
              >
                <option value="full_time">full_time</option>
                <option value="part_time">part_time</option>
                <option value="contractor">contractor</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Annual salary (cents, optional)</span>
              <input
                className="input num"
                type="number"
                min={0}
                value={compForm.annualSalaryCents}
                onChange={(event) => setCompForm({ ...compForm, annualSalaryCents: event.target.value })}
                placeholder="12000000"
              />
            </label>
            <label className="field">
              <span className="field-label">Hourly rate (cents, optional)</span>
              <input
                className="input num"
                type="number"
                min={0}
                value={compForm.hourlyRateCents}
                onChange={(event) => setCompForm({ ...compForm, hourlyRateCents: event.target.value })}
                placeholder="10000"
              />
            </label>
            <div>
              <button type="submit" className="btn" disabled={compSubmitting}>
                {compSubmitting ? "Saving..." : "Save compensation"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {me && (me.role === "owner" || me.role === "hr") ? (
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Staff directory & compensation</h3>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                void refreshStaffDirectory();
              }}
            >
              Refresh
            </button>
          </div>
          {staffLoading ? <LoadingState label="Loading staff directory..." /> : null}
          {!staffLoading ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Annual</th>
                    <th>Hourly</th>
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map((row) => (
                    <tr key={row.staffId}>
                      <td>
                        {row.fullName}
                        <div className="text-xs text-muted">{row.staffId}</div>
                      </td>
                      <td>{row.externalCode ?? "-"}</td>
                      <td>{row.employmentType ? <StatusBadge status={row.employmentType} /> : "-"}</td>
                      <td className="num">{row.annualSalaryCents != null ? formatCurrencyCents(row.annualSalaryCents) : "-"}</td>
                      <td className="num">{row.hourlyRateCents != null ? formatCurrencyCents(row.hourlyRateCents) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </ModuleShell>
  );
}
