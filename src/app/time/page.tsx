"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ApiClientError, authFetch, authJson, createIdempotencyKey } from "@/lib/client-api";

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
    <ModuleShell
      title="Time Tracking"
      description="Create and review time entries with explicit submit confirmation and idempotency keys."
      endpoints={["GET /api/time-entries/list", "POST /api/time-entries"]}
    >
      {error ? <p className="rounded-md border border-danger/40 bg-red-50 p-3 text-sm text-danger">{error}</p> : null}

      <section className="rounded-xl border border-border bg-white p-4">
        <h3 className="text-sm font-semibold">Log time entry</h3>
        <form onSubmit={submitTimeEntry} className="mt-3 grid gap-3 md:grid-cols-2">
          <select
            className="rounded border border-border px-3 py-2 text-sm"
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
          <select
            className="rounded border border-border px-3 py-2 text-sm"
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
          <input
            type="number"
            step="0.25"
            min={0.25}
            max={24}
            className="rounded border border-border px-3 py-2 text-sm"
            value={form.hours}
            onChange={(event) => setForm({ ...form, hours: event.target.value })}
            required
          />
          <input
            type="date"
            className="rounded border border-border px-3 py-2 text-sm"
            value={form.workDateUtc}
            onChange={(event) => setForm({ ...form, workDateUtc: event.target.value })}
            required
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm md:col-span-2"
            placeholder="Work description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            required
          />
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
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit time"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-white p-4">
        <h3 className="text-sm font-semibold">Recent entries</h3>
        {loading ? <p className="mt-3 text-sm text-zinc-600">Loading entries...</p> : null}
        {!loading && entries.length === 0 ? <p className="mt-3 text-sm text-zinc-600">No time entries yet.</p> : null}
        {!loading && entries.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-zinc-600">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Staff</th>
                  <th className="pb-2">Project</th>
                  <th className="pb-2">Hours</th>
                  <th className="pb-2">Billable</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/60">
                    <td className="py-2">{entry.workDateUtc.slice(0, 10)}</td>
                    <td className="py-2">{entry.employeeUserId}</td>
                    <td className="py-2">{entry.projectId}</td>
                    <td className="py-2">{entry.hours}</td>
                    <td className="py-2">{entry.billable ? "Yes" : "No"}</td>
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
