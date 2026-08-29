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
    <ModuleShell title="Time Tracking" description="Create and review time entries with explicit submit confirmation and idempotency keys.">
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading time entries..." /> : null}

      <section className="card">
        <h3 className="text-sm font-semibold text-ink">Log time entry</h3>
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
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.billable}
              onChange={(event) => setForm({ ...form, billable: event.target.checked })}
            />
            Billable
          </label>
          <div>
              <button
                type="submit"
                disabled={submitting}
                className="btn"
              >
                {submitting ? "Submitting..." : "Submit time"}
              </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h3 className="text-sm font-semibold text-ink">Recent entries</h3>
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
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2">{formatDate(entry.workDateUtc)}</td>
                    <td className="py-2">{entry.employeeUserId}</td>
                    <td className="py-2">{entry.projectId}</td>
                    <td className="num py-2">{formatHours(entry.hours)}</td>
                    <td className="py-2">
                      <StatusBadge status={entry.billable ? "billable" : "non-billable"} />
                    </td>
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
