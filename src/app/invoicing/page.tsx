import { ModuleShell } from "@/components/module-shell";

export default function InvoicingPage() {
  return (
    <ModuleShell
      title="Invoicing"
      description="Invoice generation from billable unbilled time. Delivery failures are retryable and do not remove invoices."
      endpoints={["POST /api/invoices/generate"]}
    />
  );
}
