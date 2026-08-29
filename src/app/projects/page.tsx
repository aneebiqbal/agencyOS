"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ApiClientError, authJson } from "@/lib/client-api";

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
    <ModuleShell
      title="Projects & Delivery"
      description="Project records with optimistic locking and member visibility."
      endpoints={["GET /api/projects", "GET /api/projects/:projectId", "PATCH /api/projects/:projectId/budget"]}
    >
      {error ? <p className="rounded-md border border-danger/40 bg-red-50 p-3 text-sm text-danger">{error}</p> : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-4">
          <h3 className="text-sm font-semibold">Projects</h3>
          {loading ? <p className="mt-3 text-sm text-zinc-600">Loading projects...</p> : null}
          {!loading && projects.length === 0 ? <p className="mt-3 text-sm text-zinc-600">No projects found.</p> : null}
          <div className="mt-3 flex flex-col gap-2">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedProjectId(project.id)}
                className={`rounded border px-3 py-2 text-left text-sm ${
                  selectedProjectId === project.id ? "border-accent bg-teal-50" : "border-border"
                }`}
              >
                <p className="font-medium">{project.clientName}</p>
                <p className="text-xs text-zinc-600">{project.id}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-4">
          <h3 className="text-sm font-semibold">Project detail</h3>
          {!selectedProject ? <p className="mt-3 text-sm text-zinc-600">Pick a project to inspect.</p> : null}
          {selectedProject ? (
            <div className="mt-3 space-y-3 text-sm">
              <p>
                <span className="font-medium">Client:</span> {selectedProject.project.clientName}
              </p>
              <p>
                <span className="font-medium">Status:</span> {selectedProject.project.status}
              </p>
              <p>
                <span className="font-medium">Manager:</span> {selectedProject.project.managerUserId}
              </p>
              <p>
                <span className="font-medium">Members:</span> {selectedProject.members.join(", ") || "None"}
              </p>

              <form onSubmit={updateBudget} className="space-y-2">
                <label className="block text-xs font-medium text-zinc-700">Budget (cents)</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded border border-border px-3 py-2"
                  value={budgetInput}
                  onChange={(event) => setBudgetInput(event.target.value)}
                  required
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
