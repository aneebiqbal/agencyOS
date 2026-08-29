"use client";

import { useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authJson } from "@/lib/client-api";
import { getMeCached } from "@/lib/client-me";
import { formatMoneyCents } from "@/lib/format";

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
  currency: "USD" | "PKR";
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
    currency: "PKR",
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
    if (!compForm.annualSalaryCents && !compForm.hourlyRateCents) {
      setError("Set annual salary or hourly rate before saving compensation.");
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
          currency: compForm.currency,
        }),
      });
      setResult(`Saved compensation for ${compForm.staffId}.`);
      await refreshStaffDirectory();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Failed to save compensation.");
    }
    setCompSubmitting(false);
  }

  const isOwner = me?.role === "owner";
  const canManageStaff = me?.role === "owner" || me?.role === "hr";

  return (
    <ModuleShell
      title="Administration & Access"
      description="Provision core accounts, publish mandatory notices, and maintain staff and compensation records with audit-safe controls."
    >
      {error ? <ErrorState message={error} /> : null}
      {result ? <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{result}</p> : null}

      {me && !isOwner ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Owner-only controls are hidden for your role. Current role: {me.role}
        </p>
      ) : null}

      {!me ? <LoadingState label="Loading owner context..." /> : null}

      {isOwner ? (
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="card">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Core account provisioning</h3>
              <StatusBadge status={me.role} />
            </div>
            <p className="mt-1 text-xs text-muted">
              Owner-only action for HR and CTO login creation. Server-side rules still enforce role safety and account limits.
            </p>
            <form onSubmit={provision} className="mt-4 grid gap-3 md:grid-cols-2">
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
              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <button type="submit" disabled={submitting} className="btn">
                  {submitting ? "Provisioning..." : "Provision account"}
                </button>
                <p className="text-xs text-muted">A confirmation prompt appears before submit.</p>
              </div>
            </form>
          </div>

          <div className="card bg-gradient-to-b from-white to-slate-50">
            <h3 className="text-sm font-semibold text-ink">Owner control checklist</h3>
            <p className="mt-1 text-xs text-muted">Recommended order during setup and periodic compliance reviews.</p>
            <ol className="mt-3 grid gap-2 text-sm text-muted">
              <li className="card-muted">01 Verify owner identity and org scope.</li>
              <li className="card-muted">02 Provision HR and CTO accounts only as needed.</li>
              <li className="card-muted">03 Publish current confidentiality notice version.</li>
              <li className="card-muted">04 Review staff compensation changes after updates.</li>
            </ol>
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <section className="card">
          <h3 className="text-sm font-semibold text-ink">Publish confidentiality notice</h3>
          <p className="mt-1 text-xs text-muted">Required before non-admin modules can be accessed.</p>
          <form onSubmit={publishNotice} className="mt-3 grid gap-3">
            <label className="field">
              <span className="field-label">Notice version</span>
              <input
                className="input"
                placeholder="v1 or 2026-09-policy"
                value={noticeForm.version}
                onChange={(event) => setNoticeForm({ ...noticeForm, version: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Notice text</span>
              <textarea
                className="textarea"
                placeholder="Confidentiality notice text"
                value={noticeForm.noticeText}
                onChange={(event) => setNoticeForm({ ...noticeForm, noticeText: event.target.value })}
                required
              />
            </label>
            <div>
              <button type="submit" disabled={noticePublishing} className="btn">
                {noticePublishing ? "Publishing..." : "Publish notice"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {canManageStaff ? (
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">People operations controls</h3>
              <p className="mt-1 text-xs text-muted">Add employee records, assign pay settings, and keep payroll identities current.</p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                void refreshStaffDirectory();
              }}
            >
              Refresh directory
            </button>
          </div>
        </section>
      ) : null}

      {canManageStaff ? (
        <section className="grid gap-3 xl:grid-cols-2">
          <form className="card grid gap-3" onSubmit={addStaffMember}>
            <h3 className="text-sm font-semibold text-ink">Add employee record</h3>
            <p className="text-xs text-muted">Create payroll and reporting identity records without creating platform login access.</p>
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
            <h3 className="text-sm font-semibold text-ink">Set salary and compensation</h3>
            <p className="text-xs text-muted">Supports annual salary for employees and hourly rates for contractor arrangements.</p>
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
              <span className="field-label">Currency</span>
              <select
                className="select"
                value={compForm.currency}
                onChange={(event) => setCompForm({ ...compForm, currency: event.target.value as "USD" | "PKR" })}
              >
                <option value="PKR">PKR</option>
                <option value="USD">USD</option>
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

      {canManageStaff ? (
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Staff directory and compensation</h3>
            <p className="text-xs text-muted">Records: {staffRows.length}</p>
          </div>
          {staffLoading ? <LoadingState label="Loading staff directory..." /> : null}
          {!staffLoading && staffRows.length === 0 ? (
            <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted">
              No staff records yet. Use the add employee form to create your first directory entry.
            </p>
          ) : null}
          {!staffLoading && staffRows.length > 0 ? (
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
                      <td className="num">{row.annualSalaryCents != null ? formatMoneyCents(row.annualSalaryCents, row.currency) : "-"}</td>
                      <td className="num">{row.hourlyRateCents != null ? formatMoneyCents(row.hourlyRateCents, row.currency) : "-"}</td>
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
