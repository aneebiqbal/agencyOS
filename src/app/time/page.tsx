import { ModuleShell } from "@/components/module-shell";

export default function TimePage() {
  return (
    <ModuleShell
      title="Time Tracking"
      description="Daily time entry with boundary validation, deduplication through idempotency keys, and audit logs."
      endpoints={["POST /api/time-entries"]}
    />
  );
}
