"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ErrorState, EmptyState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClientError, authJson } from "@/lib/client-api";
import { formatCurrencyCents } from "@/lib/format";

interface Project {
  id: string;
  clientName: string;
  budgetCents: number;
  status: string;
  managerUserId: string;
  version: number;
}

interface ProjectDetail {
  project: Project;
  members: string[];
}

interface CoreUser {
  userId: string;
  fullName: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [coreUsers, setCoreUsers] = useState<CoreUser[]>([]);
  const [budgetInput, setBudgetInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userById = new Map(coreUsers.map((user) => [user.userId, user.fullName]));

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, users] = await Promise.all([
        authJson<Project[]>("/api/projects"),
        authJson<CoreUser[]>("/api/core-users"),
      ]);
      setProjects(rows);
      setCoreUsers(users);
      if (!selectedProjectId && rows.length > 0) {
        setSelectedProjectId(rows[0].id);
      }
      if (selectedProjectId && rows.every((project) => project.id !== selectedProjectId)) {
        setSelectedProjectId(rows[0]?.id ?? "");
        setSelectedProject(null);
      }
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Failed to load projects.");
      setLoading(false);
    }
  }, [selectedProjectId]);

  const loadProjectDetail = useCallback(async (projectId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const detail = await authJson<ProjectDetail>(`/api/projects/${projectId}`);
      setSelectedProject(detail);
      setBudgetInput(String(detail.project.budgetCents));
      setDetailLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Failed to load project detail.");
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProjects();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      const timer = window.setTimeout(() => {
        void loadProjectDetail(selectedProjectId);
      }, 0);
      return () => {
        window.clearTimeout(timer);
      };
    }
    return undefined;
  }, [selectedProjectId, loadProjectDetail]);

  async function updateBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) {
      return;
    }

    const shouldContinue = window.confirm("Apply this budget update? This uses optimistic locking.");
    if (!shouldContinue) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await authJson<Project>(`/api/projects/${selectedProject.project.id}/budget`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          budgetCents: Number(budgetInput),
          expectedVersion: selectedProject.project.version,
        }),
      });

      setSelectedProject({ ...selectedProject, project: updated });
      setProjects((current) => current.map((project) => (project.id === updated.id ? updated : project)));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Budget update failed.");
    }
    setSaving(false);
  }

  return (
    <ModuleShell title="Projects & Delivery" description="Review active delivery work, inspect staffing, and safely update project budgets.">
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading project records..." /> : null}

      <section className="kpi-grid">
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Total projects</p>
          <p className="num mt-2 text-2xl font-semibold text-ink">{projects.length}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Active projects</p>
          <p className="num mt-2 text-2xl font-semibold text-ink">{projects.filter((project) => project.status === "active").length}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Total budget</p>
          <p className="num mt-2 text-2xl font-semibold text-ink">{formatCurrencyCents(projects.reduce((sum, project) => sum + project.budgetCents, 0))}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-sm font-semibold text-ink">Project portfolio</h3>
          <p className="mt-1 text-xs text-muted">Select a project to review details, team membership, and budget controls.</p>
          {!loading && projects.length === 0 ? (
            <EmptyState title="No projects found" guidance="A project appears here after a won deal is converted." />
          ) : null}
          {!loading && projects.length > 0 ? (
            <div className="table-wrap mt-3">
              <table className="table">
                <thead>
                  <tr>
                    <th className="pb-2">Client</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Manager</th>
                    <th className="pb-2">Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr
                      key={project.id}
                      className={selectedProjectId === project.id ? "bg-emerald-50/70" : undefined}
                    >
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedProjectId(project.id)}
                          className="text-left"
                        >
                          <p className="font-medium text-ink">{project.clientName}</p>
                          <p className="font-mono text-xs text-muted">{project.id}</p>
                        </button>
                      </td>
                      <td className="py-2">
                        <StatusBadge status={project.status} />
                      </td>
                      <td className="py-2">
                        <p className="text-ink">{userById.get(project.managerUserId) ?? "Unknown manager"}</p>
                        <p className="font-mono text-xs text-muted">{project.managerUserId}</p>
                      </td>
                      <td className="num py-2">{formatCurrencyCents(project.budgetCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-ink">Project detail</h3>
          <p className="mt-1 text-xs text-muted">Track status, staffing, and budget updates with optimistic locking.</p>
          {detailLoading ? <LoadingState label="Loading selected project..." /> : null}
          {!detailLoading && !selectedProject ? <EmptyState title="Pick a project" guidance="Select a project in the table to inspect and update it." /> : null}
          {selectedProject ? (
            <div className="mt-3 space-y-3 text-sm">
              <p>
                <span className="font-medium">Client:</span> {selectedProject.project.clientName}
              </p>
              <p>
                <span className="font-medium">Status:</span> <StatusBadge status={selectedProject.project.status} />
              </p>
              <p>
                <span className="font-medium">Manager:</span>{" "}
                <span className="text-ink">{userById.get(selectedProject.project.managerUserId) ?? "Unknown manager"}</span>{" "}
                <span className="font-mono text-xs text-muted">({selectedProject.project.managerUserId})</span>
              </p>
              <p>
                <span className="font-medium">Members:</span> {selectedProject.members.length > 0 ? selectedProject.members.join(", ") : "None"}
              </p>
              <p>
                <span className="font-medium">Budget:</span> <span className="num">{formatCurrencyCents(selectedProject.project.budgetCents)}</span>
              </p>
              <p className="text-xs text-muted">Current version for optimistic locking: {selectedProject.project.version}</p>

              <form onSubmit={updateBudget} className="space-y-2">
                <label className="field">
                  <span className="field-label">Budget (cents)</span>
                  <input
                    type="number"
                    min={0}
                    className="input num"
                    value={budgetInput}
                    onChange={(event) => setBudgetInput(event.target.value)}
                    placeholder="500000"
                    required
                  />
                  <span className="text-xs text-muted">Enter the full amount in cents. Example: 500000 = $5,000.00.</span>
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn"
                >
                  {saving ? "Saving..." : "Apply budget update"}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </section>
    </ModuleShell>
  );
}
