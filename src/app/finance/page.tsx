import { ModuleShell } from "@/components/module-shell";

export default function FinancePage() {
  return (
    <ModuleShell
      title="Finance"
      description="Revenue versus cost summary and net margin projection from invoices, payroll summaries, and reimbursed expenses."
      endpoints={["GET /api/finance/summary", "GET /api/audit-logs"]}
    />
  );
}
