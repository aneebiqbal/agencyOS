"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authFetch, authJson, createIdempotencyKey } from "@/lib/client-api";
import { formatDate, formatHours } from "@/lib/format";

interface Project {
  id: string;
  clientName: string;
}

interface StaffMember {
  staffId: string;
  fullName: string;
}

interface TimeEntry {
  id: string;
  employeeUserId: string;
  projectId: string;
  hours: number;
  billable: boolean;
  description: string;
  workDateUtc: string;
}

export default function TimePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeUserId: "",
    projectId: "",
    hours: "8",
    billable: true,
    description: "",
    workDateUtc: new Date().toISOString().slice(0, 10),
  });

  const staffById = new Map(staff.map((person) => [person.staffId, person]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const billableHours = entries.filter((entry) => entry.billable).reduce((sum, entry) => sum + entry.hours, 0);
  const nonBillableHours = entries.filter((entry) => !entry.billable).reduce((sum, entry) => sum + entry.hours, 0);
  const canSubmit = Boolean(form.employeeUserId && form.projectId && staff.length > 0 && projects.length > 0);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectRows, staffRows, entryRows] = await Promise.all([
        authJson<Project[]>("/api/projects"),
        authJson<StaffMember[]>("/api/staff-members"),
        authJson<TimeEntry[]>("/api/time-entries/list"),
      ]);
      setProjects(projectRows);
      setStaff(staffRows);
      setEntries(entryRows);

      setForm((current) => ({
        ...current,
        employeeUserId: current.employeeUserId || staffRows[0]?.staffId || "",
        projectId: current.projectId || projectRows[0]?.id || "",
      }));
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Unable to load time page data.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshData();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshData]);

  async function submitTimeEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shouldContinue = window.confirm("Submit this time entry?");
    if (!shouldContinue) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await authFetch("/api/time-entries", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": createIdempotencyKey("time"),
        },
        body: JSON.stringify({
          employeeUserId: form.employeeUserId,
          projectId: form.projectId,
          hours: Number(form.hours),
          billable: form.billable,
          description: form.description,
          workDateUtc: `${form.workDateUtc}T12:00:00.000Z`,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new ApiClientError(body.message ?? "Time entry submission failed.", response.status);
      }
      setForm((current) => ({ ...current, description: "" }));
      await refreshData();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Time entry submission failed.");
    }
    setSubmitting(false);
  }

  return (
    <ModuleShell title="Time Tracking" description="Capture delivery time accurately and review entries by person, project, and billable status.">
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading time entries..." /> : null}

      <section className="kpi-grid">
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Recent entries</p>
          <p className="num mt-2 text-2xl font-semibold text-ink">{entries.length}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Billable hours</p>
          <p className="num mt-2 text-2xl font-semibold text-ink">{formatHours(billableHours)}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Non-billable hours</p>
          <p className="num mt-2 text-2xl font-semibold text-ink">{formatHours(nonBillableHours)}</p>
        </div>
      </section>

      <section className="card">
        <h3 className="text-sm font-semibold text-ink">Log time entry</h3>
        <p className="mt-1 text-xs text-muted">Complete all fields so finance and delivery reporting stay clean.</p>
        {!loading && staff.length === 0 ? (
          <EmptyState title="No staff members available" guidance="Create a staff member first, then return to log time." />
        ) : null}
        {!loading && projects.length === 0 ? (
          <EmptyState title="No projects available" guidance="Create or convert a project first, then log time against it." />
        ) : null}
        <form onSubmit={submitTimeEntry} className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="field">
            <span className="field-label">Staff member</span>
            <select
              className="select"
              value={form.employeeUserId}
              onChange={(event) => setForm({ ...form, employeeUserId: event.target.value })}
              required
            >
              <option value="">Select staff</option>
              {staff.map((person) => (
                <option key={person.staffId} value={person.staffId}>
                  {person.fullName} ({person.staffId})
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">Primary assignee for the work completed on this date.</span>
          </label>
          <label className="field">
            <span className="field-label">Project</span>
            <select
              className="select"
              value={form.projectId}
              onChange={(event) => setForm({ ...form, projectId: event.target.value })}
              required
            >
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.clientName} ({project.id})
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">Pick the exact project where effort should be reported.</span>
          </label>
          <label className="field">
            <span className="field-label">Hours</span>
            <input
              type="number"
              step="0.25"
              min={0.25}
              max={24}
              className="input num"
              value={form.hours}
              onChange={(event) => setForm({ ...form, hours: event.target.value })}
              required
            />
            <span className="text-xs text-muted">Use quarter-hour increments (0.25, 0.5, 1.0, etc.).</span>
          </label>
          <label className="field">
            <span className="field-label">Work date</span>
            <input
              type="date"
              className="input"
              value={form.workDateUtc}
              onChange={(event) => setForm({ ...form, workDateUtc: event.target.value })}
              required
            />
            <span className="text-xs text-muted">Stored in UTC with a fixed midday timestamp.</span>
          </label>
          <label className="field md:col-span-2">
            <span className="field-label">Work description</span>
            <input
              className="input"
              placeholder="Client workshop, architecture review, sprint planning"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              required
            />
            <span className="text-xs text-muted">Be specific so project managers can approve and invoice quickly.</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.billable}
              onChange={(event) => setForm({ ...form, billable: event.target.checked })}
            />
            Billable
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="btn"
            >
              {submitting ? "Submitting..." : "Submit time entry"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h3 className="text-sm font-semibold text-ink">Recent entries</h3>
        <p className="mt-1 text-xs text-muted">Names are shown first with IDs preserved for audit and API traceability.</p>
        {!loading && entries.length === 0 ? (
          <EmptyState title="No time entries yet" guidance="Submit a time entry above to populate this register." />
        ) : null}
        {!loading && entries.length > 0 ? (
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Staff</th>
                  <th className="pb-2">Project</th>
                  <th className="pb-2">Hours</th>
                  <th className="pb-2">Billable</th>
                  <th className="pb-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2">{formatDate(entry.workDateUtc)}</td>
                    <td className="py-2">
                      <p>{staffById.get(entry.employeeUserId)?.fullName ?? "Unknown staff"}</p>
                      <p className="font-mono text-xs text-muted">{entry.employeeUserId}</p>
                    </td>
                    <td className="py-2">
                      <p>{projectById.get(entry.projectId)?.clientName ?? "Unknown project"}</p>
                      <p className="font-mono text-xs text-muted">{entry.projectId}</p>
                    </td>
                    <td className="num py-2">{formatHours(entry.hours)}</td>
                    <td className="py-2">
                      <StatusBadge status={entry.billable ? "billable" : "non-billable"} />
                    </td>
                    <td className="py-2">{entry.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </ModuleShell>
  );
}
