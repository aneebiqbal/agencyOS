"use client";

import { useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authJson } from "@/lib/client-api";
import { getMeCached } from "@/lib/client-me";
import { formatCurrencyCents } from "@/lib/format";

interface MePayload {
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

export default function EmployeesPage() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [rows, setRows] = useState<StaffDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [savingComp, setSavingComp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState({ staffId: "", fullName: "", externalCode: "" });
  const [compForm, setCompForm] = useState({
    staffId: "",
    employmentType: "full_time",
    annualSalaryCents: "",
    hourlyRateCents: "",
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const profile = await getMeCached();
      setMe(profile);
      if (profile.role !== "owner" && profile.role !== "hr") {
        setRows([]);
        setLoading(false);
        return;
      }

      const staffRows = await authJson<StaffDirectoryRow[]>("/api/staff-directory");
      setRows(staffRows);
      setCompForm((current) => ({ ...current, staffId: current.staffId || staffRows[0]?.staffId || "" }));
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Could not load employee directory.");
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function addEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingEmployee(true);
    setError(null);
    setMessage(null);
    try {
      await authJson("/api/staff-members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(employeeForm),
      });
      setMessage(`Added employee ${employeeForm.fullName} (${employeeForm.staffId}).`);
      setEmployeeForm({ staffId: "", fullName: "", externalCode: "" });
      await load();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Could not add employee.");
    }
    setSavingEmployee(false);
  }

  async function saveCompensation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!compForm.staffId) {
      setError("Select a staff member first.");
      return;
    }

    setSavingComp(true);
    setError(null);
    setMessage(null);
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
      setMessage(`Saved compensation for ${compForm.staffId}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Could not save compensation.");
    }
    setSavingComp(false);
  }

  return (
    <ModuleShell title="Employees" description="Manage employee records without login accounts and store salary or contractor rates.">
      {error ? <ErrorState message={error} /> : null}
      {message ? <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}
      {loading ? <LoadingState label="Loading employees..." /> : null}

      {me && me.role !== "owner" && me.role !== "hr" ? (
        <ErrorState message="Only owner or hr can manage employee records." />
      ) : null}

      {me && (me.role === "owner" || me.role === "hr") ? (
        <section className="grid gap-3 xl:grid-cols-2">
          <form className="card grid gap-3" onSubmit={addEmployee}>
            <h2 className="text-sm font-semibold text-ink">Add employee (no login)</h2>
            <p className="text-xs text-muted">Use this for payroll, time tracking, expenses, and reporting identities.</p>
            <label className="field">
              <span className="field-label">Employee ID</span>
              <input
                className="input"
                placeholder="emp-1001"
                value={employeeForm.staffId}
                onChange={(event) => setEmployeeForm({ ...employeeForm, staffId: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Full name</span>
              <input
                className="input"
                placeholder="Avery Stone"
                value={employeeForm.fullName}
                onChange={(event) => setEmployeeForm({ ...employeeForm, fullName: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">External code (optional)</span>
              <input
                className="input"
                placeholder="PAY-1001"
                value={employeeForm.externalCode}
                onChange={(event) => setEmployeeForm({ ...employeeForm, externalCode: event.target.value })}
              />
            </label>
            <div>
              <button type="submit" className="btn" disabled={savingEmployee}>
                {savingEmployee ? "Adding..." : "Add employee"}
              </button>
            </div>
          </form>

          <form className="card grid gap-3" onSubmit={saveCompensation}>
            <h2 className="text-sm font-semibold text-ink">Set compensation</h2>
            <p className="text-xs text-muted">Add annual salary or hourly rate. This does not create platform login users.</p>
            <label className="field">
              <span className="field-label">Employee</span>
              <select
                className="select"
                value={compForm.staffId}
                onChange={(event) => setCompForm({ ...compForm, staffId: event.target.value })}
                required
              >
                <option value="">Select employee</option>
                {rows.map((row) => (
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
                type="number"
                min={0}
                className="input num"
                value={compForm.annualSalaryCents}
                onChange={(event) => setCompForm({ ...compForm, annualSalaryCents: event.target.value })}
                placeholder="12000000"
              />
            </label>
            <label className="field">
              <span className="field-label">Hourly rate (cents, optional)</span>
              <input
                type="number"
                min={0}
                className="input num"
                value={compForm.hourlyRateCents}
                onChange={(event) => setCompForm({ ...compForm, hourlyRateCents: event.target.value })}
                placeholder="9500"
              />
            </label>
            <div>
              <button type="submit" className="btn" disabled={savingComp}>
                {savingComp ? "Saving..." : "Save compensation"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Employee directory</h2>
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>External code</th>
                <th>Type</th>
                <th>Annual salary</th>
                <th>Hourly rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
      </section>
    </ModuleShell>
  );
}
