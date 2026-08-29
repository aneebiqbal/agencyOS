import { ModuleShell } from "@/components/module-shell";
import { SensitiveViewGuard } from "@/components/sensitive-view-guard";

export default function PayrollPage() {
  return (
    <div className="select-none" onContextMenu={(event) => event.preventDefault()}>
      <ModuleShell
        title="Payroll (Provider Sync)"
        description="Read-only payroll run totals to keep statutory tax logic in Gusto/Deel/Rippling and out of local code."
        endpoints={["GET /api/payroll/runs"]}
      />
      <SensitiveViewGuard />
    </div>
  );
}
