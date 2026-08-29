"use client";

import { useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { ApiClientError, authJson } from "@/lib/client-api";

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
        }),
      });

      setPreview(data);
      setRowEmployeeLinks({});
      setRowProjectDecisions({});
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

  return (
    <ModuleShell
      title="CSV Import Pipeline"
      description="Upload CSV, preview parsing/flags, resolve flagged rows, then confirm commit."
      endpoints={["POST /api/imports/preview", "POST /api/imports/confirm", "POST /api/imports/:batchId/undo"]}
    >
      {error ? <p className="rounded-md border border-danger/40 bg-red-50 p-3 text-sm text-danger">{error}</p> : null}

      <section className="rounded-xl border border-border bg-white p-4">
        <h3 className="text-sm font-semibold">Step 1: Upload + Preview</h3>
        <form onSubmit={runPreview} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="file" name="csvFile" accept=".csv,text/csv" className="text-sm" required />
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Generating preview..." : "Generate preview"}
          </button>
        </form>
      </section>

      {preview ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total", preview.totals.total],
              ["Clean", preview.totals.clean],
              ["Flagged", preview.totals.flagged],
              ["Skipped", preview.totals.skipped],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-600">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-border bg-white p-4">
            <h3 className="text-sm font-semibold">Step 2: Resolve flagged rows + confirm</h3>
            {preview.unmappedColumns.length > 0 ? (
              <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
                Unmapped columns: {preview.unmappedColumns.join(", ")}. Confirm is blocked until CSV mapping is corrected.
              </p>
            ) : null}

            {preview.flaggedRows.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No flagged rows detected. Ready to confirm.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {preview.flaggedRows.slice(0, 50).map((row) => (
                  <div key={row.rowNumber} className="rounded border border-border p-3 text-sm">
                    <p className="font-medium">
                      Row {row.rowNumber} ({row.rowType})
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-zinc-700">
                      {row.flags.map((flag) => (
                        <li key={`${row.rowNumber}-${flag.code}`}>{flag.message}</li>
                      ))}
                    </ul>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <input
                        className="rounded border border-border px-2 py-1"
                        placeholder="Resolved staff id"
                        value={rowEmployeeLinks[String(row.rowNumber)] ?? ""}
                        onChange={(event) =>
                          setRowEmployeeLinks((current) => ({
                            ...current,
                            [String(row.rowNumber)]: event.target.value,
                          }))
                        }
                      />
                      <select
                        className="rounded border border-border px-2 py-1"
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
                        className="rounded border border-border px-2 py-1"
                        placeholder="Project name (optional)"
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
                {preview.flaggedRows.length > 50 ? (
                  <p className="text-xs text-zinc-500">Showing first 50 flagged rows in UI preview.</p>
                ) : null}
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

            <button
              type="button"
              disabled={confirming || preview.unmappedColumns.length > 0}
              onClick={() => {
                void confirmImport();
              }}
              className="mt-4 rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {confirming ? "Confirming..." : "Confirm import"}
            </button>

            {result ? (
              <p className="mt-3 rounded border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900">
                Import committed. Batch `{result.batchId}` - imported {result.importedRows}, skipped {result.skippedRows}.
              </p>
            ) : null}

            {staff.length > 0 ? (
              <p className="mt-3 text-xs text-zinc-500">
                Known staff ids: {staff.map((person) => person.staffId).join(", ")}
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </ModuleShell>
  );
}
