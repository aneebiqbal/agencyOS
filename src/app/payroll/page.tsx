import { ModuleShell } from "@/components/module-shell";

export default function PayrollPage() {
  return (
    <ModuleShell
      title="Payroll (Provider Sync)"
      description="Read-only payroll run totals to keep statutory tax logic in Gusto/Deel/Rippling and out of local code."
      endpoints={["GET /api/payroll/runs"]}
    />
  );
}
