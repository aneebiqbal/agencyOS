import { ModuleShell } from "@/components/module-shell";

export default function ExpensesPage() {
  return (
    <ModuleShell
      title="Expenses"
      description="Expense submission boilerplate with amount constraints, approver linkage, and immutable auditing."
      endpoints={["POST /api/expenses"]}
    />
  );
}
