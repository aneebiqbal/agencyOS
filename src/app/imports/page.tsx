import { ModuleShell } from "@/components/module-shell";

export default function ImportsPage() {
  return (
    <ModuleShell
      title="CSV Import Pipeline"
      description="Two-step preview and confirm flow for employee time/expense ingestion with explicit human confirmation for all flagged rows."
      endpoints={[
        "POST /api/imports/preview",
        "POST /api/imports/confirm",
        "POST /api/imports/:batchId/undo",
      ]}
    />
  );
}
