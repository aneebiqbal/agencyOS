import type { ReactNode } from "react";

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="card-muted text-sm text-muted">
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ title, guidance }: { title: string; guidance: string }) {
  return (
    <div className="card-muted text-sm text-muted">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1">{guidance}</p>
    </div>
  );
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  const lowerMessage = message.toLowerCase();
  const isConfidentialityBlock = lowerMessage.includes("confidentiality");
  const isNotConfigured = lowerMessage.includes("not configured");

  function openConfidentialityDialog() {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(new CustomEvent("agencyos:open-confidentiality"));
  }

  return (
    <div
      className={`rounded-lg p-3 text-sm ${
        isConfidentialityBlock
          ? "border border-amber-300 bg-amber-50 text-amber-900"
          : "border border-danger/30 bg-danger/5 text-danger"
      }`}
    >
      <p>
        {isConfidentialityBlock
          ? isNotConfigured
            ? "Access is blocked because confidentiality notice is not configured. Ask owner to publish one, then reload."
            : "Access is blocked until you acknowledge confidentiality. Use the popup to continue."
          : message}
      </p>
      {isConfidentialityBlock ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {!isNotConfigured ? (
            <button
              type="button"
              onClick={openConfidentialityDialog}
              className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold"
            >
              Open confidentiality popup
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-semibold"
          >
            Reload page
          </button>
          {isNotConfigured ? (
            <a
              href="/admin"
              className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold"
            >
              Open admin
            </a>
          ) : null}
        </div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
