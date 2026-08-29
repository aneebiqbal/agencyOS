import type { ReactNode } from "react";

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state-panel" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{label}</p>
        <span className="state-accent">Loading</span>
      </div>
      <div className="mt-3 grid gap-2">
        <div className="loading-line w-full" />
        <div className="loading-line w-4/5" />
      </div>
    </div>
  );
}

export function EmptyState({ title, guidance }: { title: string; guidance: string }) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="state-accent">Empty</span>
      <p className="mt-2 text-base font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{guidance}</p>
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
      className={`rounded-xl border p-4 text-sm ${
        isConfidentialityBlock
          ? "border-amber-300 bg-amber-50/90 text-amber-950"
          : "border-danger/30 bg-danger/10 text-danger"
      }`}
      role="alert"
      aria-live="assertive"
    >
      <p className="font-medium leading-6">
        {isConfidentialityBlock
          ? isNotConfigured
            ? "Access is blocked because confidentiality notice is not configured. Ask owner to publish one, then reload."
            : "Access is blocked until you acknowledge confidentiality. Use the popup to continue."
          : message}
      </p>
      {isConfidentialityBlock ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!isNotConfigured ? (
            <button
              type="button"
              onClick={openConfidentialityDialog}
              className="btn-secondary border-amber-300 bg-white px-3 py-1.5 text-xs"
            >
              Open confidentiality popup
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn border-amber-400 bg-amber-600 px-3 py-1.5 text-xs text-white hover:brightness-100"
          >
            Reload page
          </button>
          {isNotConfigured ? (
            <a
              href="/admin"
              className="btn-secondary border-amber-300 bg-white px-3 py-1.5 text-xs"
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
