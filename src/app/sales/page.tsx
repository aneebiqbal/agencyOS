import { ModuleShell } from "@/components/module-shell";

export default function SalesPage() {
  return (
    <ModuleShell
      title="Sales Pipeline"
      description="Lead intake and stage transitions, including atomic won-deal to project conversion."
      endpoints={[
        "GET /api/leads",
        "POST /api/leads",
        "POST /api/deals/:dealId/win",
      ]}
    />
  );
}
