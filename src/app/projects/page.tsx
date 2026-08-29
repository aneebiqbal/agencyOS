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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await authJson<Project[]>("/api/projects");
      setProjects(rows);
      if (!selectedProjectId && rows.length > 0) {
        setSelectedProjectId(rows[0].id);
      }
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Failed to load projects.");
      setLoading(false);
    }
  }, [selectedProjectId]);

  const loadProjectDetail = useCallback(async (projectId: string) => {
    setError(null);
    try {
      const detail = await authJson<ProjectDetail>(`/api/projects/${projectId}`);
      setSelectedProject(detail);
      setBudgetInput(String(detail.project.budgetCents));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Failed to load project detail.");
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
    <ModuleShell title="Projects & Delivery" description="Project records with optimistic locking and member visibility.">
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
          <h3 className="text-sm font-semibold text-ink">Projects</h3>
          {!loading && projects.length === 0 ? (
            <EmptyState title="No projects found" guidance="A project appears here after a won deal is converted." />
          ) : null}
          <div className="mt-3 flex flex-col gap-2">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedProjectId(project.id)}
                className={`rounded border px-3 py-2 text-left text-sm ${
                  selectedProjectId === project.id ? "border-accent bg-emerald-50" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-ink">{project.clientName}</p>
                  <StatusBadge status={project.status} />
                </div>
                <p className="text-xs text-muted">{project.id}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-ink">Project detail</h3>
          {!selectedProject ? <EmptyState title="Pick a project" guidance="Select any row in the left pane to inspect details." /> : null}
          {selectedProject ? (
            <div className="mt-3 space-y-3 text-sm">
              <p>
                <span className="font-medium">Client:</span> {selectedProject.project.clientName}
              </p>
              <p>
                <span className="font-medium">Status:</span> <StatusBadge status={selectedProject.project.status} />
              </p>
              <p>
                <span className="font-medium">Manager:</span> {selectedProject.project.managerUserId}
              </p>
              <p>
                <span className="font-medium">Members:</span> {selectedProject.members.join(", ") || "None"}
              </p>
              <p>
                <span className="font-medium">Budget:</span> <span className="num">{formatCurrencyCents(selectedProject.project.budgetCents)}</span>
              </p>

              <form onSubmit={updateBudget} className="space-y-2">
                <label className="field">
                  <span className="field-label">Budget (cents)</span>
                  <input
                    type="number"
                    min={0}
                    className="input num"
                    value={budgetInput}
                    onChange={(event) => setBudgetInput(event.target.value)}
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn"
                >
                  {saving ? "Saving..." : "Update budget"}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </section>
    </ModuleShell>
  );
}
