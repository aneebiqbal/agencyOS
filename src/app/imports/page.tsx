"use client";

import { useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { ApiClientError, authJson } from "@/lib/client-api";

const CANONICAL_MAPPING_KEYS = ["employee_name", "employee_id", "project", "date", "hours", "amount", "description", "category"] as const;

interface ImportFlag {
  code: string;
  message: string;
  requiresHuman: boolean;
  suggestions?: string[];
}

interface ParsedImportRow {
  rowNumber: number;
  rowType: "time_entry" | "expense";
  normalized: {
    employeeName: string | null;
    employeeId: string | null;
    projectName: string | null;
    dateUtc: string | null;
    hours: number | null;
    amountCents: number | null;
    description: string;
    category: string | null;
  };
  flags: ImportFlag[];
}

interface ImportPreview {
  previewId: string;
  sourceFilename: string;
  detectedEncoding: string;
  mapping: Record<string, string | null>;
  unmappedColumns: string[];
  cleanRows: ParsedImportRow[];
  flaggedRows: ParsedImportRow[];
  skippedRows: ParsedImportRow[];
  totals: { total: number; clean: number; flagged: number; skipped: number };
}

interface StaffMember {
  staffId: string;
  fullName: string;
}

export default function ImportsPage() {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ batchId: string; importedRows: number; skippedRows: number } | null>(null);
  const [forceReimport, setForceReimport] = useState(false);
  const [rowEmployeeLinks, setRowEmployeeLinks] = useState<Record<string, string>>({});
  const [rowProjectDecisions, setRowProjectDecisions] = useState<
    Record<string, { action: "use_existing" | "create_project" | "skip"; projectName?: string }>
  >({});
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void authJson<StaffMember[]>("/api/staff-members")
        .then((rows) => setStaff(rows))
        .catch(() => {
          // no-op, page still works with manual IDs
        });
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  async function toBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  async function runPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const fileInput = event.currentTarget.elements.namedItem("csvFile") as HTMLInputElement | null;
      const file = fileInput?.files?.[0];
      if (!file) {
        throw new ApiClientError("Choose a CSV file first.", 400);
      }

      const csvBase64 = await toBase64(file);
      const data = await authJson<ImportPreview>("/api/imports/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceFilename: file.name,
          csvBase64,
          mappingOverrides: Object.keys(mappingOverrides).length > 0 ? mappingOverrides : undefined,
        }),
      });

      setPreview(data);
      setRowEmployeeLinks({});
      setMappingOverrides(
        Object.fromEntries(
          Object.entries(data.mapping).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        ),
      );
      setRowProjectDecisions(
        Object.fromEntries(
          data.flaggedRows.map((row) => [
            String(row.rowNumber),
            {
              action: "skip" as const,
              projectName: row.normalized.projectName ?? "",
            },
          ]),
        ),
      );
      setLoading(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Preview failed.");
      setLoading(false);
    }
  }

  async function confirmImport() {
    if (!preview) {
      return;
    }

    const shouldContinue = window.confirm("Confirm import batch and commit rows?");
    if (!shouldContinue) {
      return;
    }

    setConfirming(true);
    setError(null);

    try {
      const data = await authJson<{ batchId: string; importedRows: number; flaggedRows: number; skippedRows: number }>(
        "/api/imports/confirm",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            previewId: preview.previewId,
            forceReimport,
            rowEmployeeLinks,
            rowProjectDecisions,
          }),
        },
      );
      setResult({ batchId: data.batchId, importedRows: data.importedRows, skippedRows: data.skippedRows });
      setConfirming(false);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Confirm failed.");
      setConfirming(false);
    }
  }

  const requiresHumanCount = preview
    ? preview.flaggedRows.reduce((count, row) => count + row.flags.filter((flag) => flag.requiresHuman).length, 0)
    : 0;
  const headerOptions = preview
    ? Array.from(
        new Set([
          ...preview.unmappedColumns,
          ...Object.values(preview.mapping).filter((header): header is string => Boolean(header)),
        ]),
      )
    : [];

  return (
    <ModuleShell title="CSV Import Pipeline" description="Upload CSV, preview parsing/flags, resolve flagged rows, then confirm commit.">
      {error ? <ErrorState message={error} /> : null}

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Step 1. Upload and validate file</h3>
            <p className="mt-1 text-sm text-muted">Upload one CSV file to generate a structured preview before any records are committed.</p>
          </div>
          <span className="status-badge status-info">Safe preview mode</span>
        </div>
        <form id="import-preview-form" onSubmit={runPreview} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="file" name="csvFile" accept=".csv,text/csv" className="input text-sm" required />
          <button
            type="submit"
            disabled={loading}
            className="btn"
          >
            {loading ? "Generating preview..." : "Generate preview"}
          </button>
        </form>
        {staff.length > 0 ? (
          <p className="mt-3 text-xs text-muted">Known staff for resolution: {staff.map((person) => `${person.fullName} (${person.staffId})`).join(", ")}</p>
        ) : (
          <p className="mt-3 text-xs text-muted">Staff records are unavailable right now; manual staff IDs still work in resolution fields.</p>
        )}
      </section>

      {preview ? (
        <>
          <section className="kpi-grid">
            {[
              { label: "Total rows", value: preview.totals.total },
              { label: "Clean rows", value: preview.totals.clean },
              { label: "Flagged rows", value: preview.totals.flagged },
              { label: "Skipped rows", value: preview.totals.skipped },
            ].map((item) => (
              <div key={item.label} className="card">
                <p className="text-xs uppercase tracking-wide text-muted">{item.label}</p>
                <p className="num mt-2 text-2xl font-semibold text-ink">{item.value}</p>
              </div>
            ))}
          </section>

          <section className="card">
            <h3 className="text-sm font-semibold text-ink">Preview metadata</h3>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <div className="card-muted">
                <p className="field-label">Source file</p>
                <p className="mt-1 font-medium text-ink">{preview.sourceFilename}</p>
              </div>
              <div className="card-muted">
                <p className="field-label">Detected encoding</p>
                <p className="mt-1 font-medium text-ink">{preview.detectedEncoding}</p>
              </div>
              <div className="card-muted">
                <p className="field-label">Preview batch ID</p>
                <p className="mt-1 font-mono text-xs text-ink">{preview.previewId}</p>
              </div>
              <div className="card-muted">
                <p className="field-label">Human-review flags</p>
                <p className="mt-1 num font-medium text-ink">{requiresHumanCount}</p>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Step 2. Resolve flagged rows and decisions</h3>
                <p className="mt-1 text-sm text-muted">Resolve staff/project decisions for flagged rows, then proceed to commit.</p>
              </div>
              <span className="status-badge status-warn">Resolution required</span>
            </div>

            {preview.unmappedColumns.length > 0 ? (
              <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>
                  Unmapped columns: {preview.unmappedColumns.join(", ")}. Confirm is blocked until mapping is resolved.
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {CANONICAL_MAPPING_KEYS.map((key) => (
                    <label key={key} className="field">
                      <span className="field-label">Map {key.replace(/_/g, " ")}</span>
                      <select
                        className="select"
                        value={mappingOverrides[key] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setMappingOverrides((current) => {
                            if (!value) {
                              const next = { ...current };
                              delete next[key];
                              return next;
                            }
                            return { ...current, [key]: value };
                          });
                        }}
                      >
                        <option value="">Auto detect</option>
                        {headerOptions.map((header) => (
                          <option key={`${key}:${header}`} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn mt-3"
                  onClick={() => {
                    const form = document.getElementById("import-preview-form") as HTMLFormElement | null;
                    form?.requestSubmit();
                  }}
                  disabled={loading}
                >
                  {loading ? "Regenerating..." : "Re-run preview with mapping"}
                </button>
              </div>
            ) : null}

            {preview.flaggedRows.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No flagged rows detected. Ready to confirm.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {preview.flaggedRows.map((row) => (
                  <div key={row.rowNumber} className="card-muted text-sm">
                    <p className="font-medium">
                      Row {row.rowNumber} ({row.rowType})
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-slate-700">
                      {row.flags.map((flag) => (
                        <li key={`${row.rowNumber}-${flag.code}`}>{flag.message}</li>
                      ))}
                    </ul>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      {staff.length > 0 ? (
                        <select
                          className="select"
                          value={rowEmployeeLinks[String(row.rowNumber)] ?? ""}
                          onChange={(event) =>
                            setRowEmployeeLinks((current) => ({
                              ...current,
                              [String(row.rowNumber)]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select staff</option>
                          {staff.map((person) => (
                            <option key={person.staffId} value={person.staffId}>
                              {person.fullName} ({person.staffId})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input"
                          placeholder="Resolved staff ID"
                          value={rowEmployeeLinks[String(row.rowNumber)] ?? ""}
                          onChange={(event) =>
                            setRowEmployeeLinks((current) => ({
                              ...current,
                              [String(row.rowNumber)]: event.target.value,
                            }))
                          }
                        />
                      )}
                      <select
                        className="select"
                        value={rowProjectDecisions[String(row.rowNumber)]?.action ?? "skip"}
                        onChange={(event) =>
                          setRowProjectDecisions((current) => ({
                            ...current,
                            [String(row.rowNumber)]: {
                              ...current[String(row.rowNumber)],
                              action: event.target.value as "use_existing" | "create_project" | "skip",
                            },
                          }))
                        }
                      >
                        <option value="skip">Skip row</option>
                        <option value="use_existing">Use existing project</option>
                        <option value="create_project">Create project</option>
                      </select>
                      <input
                        className="input"
                        placeholder="Project name (only if needed)"
                        value={rowProjectDecisions[String(row.rowNumber)]?.projectName ?? ""}
                        onChange={(event) =>
                          setRowProjectDecisions((current) => ({
                            ...current,
                            [String(row.rowNumber)]: {
                              action: current[String(row.rowNumber)]?.action ?? "skip",
                              projectName: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-sm">
              <input
                id="forceReimport"
                type="checkbox"
                checked={forceReimport}
                onChange={(event) => setForceReimport(event.target.checked)}
              />
              <label htmlFor="forceReimport">Force re-import if file hash already exists</label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={confirming || preview.unmappedColumns.length > 0}
                onClick={() => {
                  void confirmImport();
                }}
                className="btn"
              >
                {confirming ? "Committing batch..." : "Step 3. Confirm and commit import"}
              </button>
              {preview.unmappedColumns.length > 0 ? (
                <span className="text-sm text-muted">Resolve column mapping issues to enable commit.</span>
              ) : null}
            </div>

            {result ? (
              <p className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                Import committed. Batch `{result.batchId}` - imported {result.importedRows}, skipped {result.skippedRows}.
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="card">
          {loading ? (
            <LoadingState label="Generating preview and parsing records..." />
          ) : (
            <EmptyState
              title="No preview generated yet"
              guidance="Upload a CSV file above to inspect clean, flagged, and skipped rows before committing."
            />
          )}
        </section>
      )}
    </ModuleShell>
  );
}
