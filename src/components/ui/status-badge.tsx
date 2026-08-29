import { formatStatusLabel } from "@/lib/format";

const STATUS_TONE: Record<string, string> = {
  won: "status-success",
  paid: "status-success",
  approved: "status-success",
  reimbursed: "status-success",
  sent: "status-success",
  completed: "status-success",
  active: "status-success",
  pending: "status-warn",
  submitted: "status-warn",
  proposal: "status-warn",
  draft: "status-info",
  qualified: "status-info",
  new: "status-info",
  open: "status-info",
  full_time: "status-success",
  part_time: "status-info",
  contractor: "status-warn",
  send_failed: "status-danger",
  failed: "status-danger",
  lost: "status-danger",
  archived: "status-muted",
};

export function StatusBadge({ status }: { status: string }) {
  const toneClass = STATUS_TONE[status] ?? "status-muted";
  return <span className={`status-badge ${toneClass}`}>{formatStatusLabel(status)}</span>;
}
