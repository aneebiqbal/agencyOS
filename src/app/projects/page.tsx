import { ModuleShell } from "@/components/module-shell";

export default function ProjectsPage() {
  return (
    <ModuleShell
      title="Projects & Delivery"
      description="Project records with optimistic locking for budget updates and RBAC checks at query layer."
      endpoints={[
        "GET /api/projects",
        "PATCH /api/projects/:projectId/budget",
      ]}
    />
  );
}
