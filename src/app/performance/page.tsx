import { ModuleShell } from "@/components/module-shell";

export default function PerformancePage() {
  return (
    <ModuleShell
      title="Performance"
      description="Derived metrics only: utilization, delivery reliability, and attributable revenue with role-scoped visibility."
      endpoints={["GET /api/performance/snapshots"]}
    />
  );
}
