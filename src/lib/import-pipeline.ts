import { createHash, randomUUID } from "node:crypto";

import { badRequest } from "@/lib/domain/errors";

const MAX_ROWS = 10_000;

const headerAliases: Record<string, string[]> = {
  employee_name: ["employee", "name", "emp name", "employee_name", "staff", "staff name"],
  employee_id: ["employee id", "emp id", "staff id", "staff_code", "employee_code", "id"],
  project: ["project", "client", "project name", "client name"],
  date: ["date", "work date", "entry date"],
  hours: ["hours", "time", "hrs"],
  amount: ["amount", "expense", "cost", "value"],
  description: ["description", "note", "details", "memo"],
  category: ["category", "expense category", "type"],
};

export type ImportFlagCode =
  | "unmapped_column"
  | "unknown_employee"
  | "ambiguous_employee"
  | "unknown_project"
  | "negative_or_impossible_value"
  | "future_date"
  | "possible_duplicate_row"
  | "number_format_warning"
  | "row_parse_error"
  | "missing_required_field"
  | "corrupted_file"
  | "duplicate_file_hash";

export interface ImportFlag {
  code: ImportFlagCode;
  message: string;
  requiresHuman: boolean;
  suggestions?: string[];
}

export interface ParsedImportRow {
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
  raw: Record<string, string>;
  flags: ImportFlag[];
}

export interface ImportPreview {
  previewId: string;
  sourceFilename: string;
  fileHashSha256: string;
  detectedEncoding: string;
  mapping: Record<string, string | null>;
  unmappedColumns: string[];
  cleanRows: ParsedImportRow[];
  flaggedRows: ParsedImportRow[];
  skippedRows: ParsedImportRow[];
  totals: { total: number; clean: number; flagged: number; skipped: number };
}

export interface PreviewInput {
  sourceFilename: string;
  fileBytes: Uint8Array;
  mappingOverrides?: Record<string, string>;
  knownEmployees: Array<{ staffId: string; fullName: string }>;
  knownProjects: string[];
  duplicateFileHash: boolean;
}

const previewCache = new Map<string, { preview: ImportPreview; createdAtMs: number }>();

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function detectEncoding(bytes: Uint8Array): { encoding: string; text: string } {
  try {
    const utf8Text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { encoding: "utf-8", text: utf8Text.replace(/^\uFEFF/, "") };
  } catch {
    const latinText = new TextDecoder("windows-1252").decode(bytes);
    return { encoding: "windows-1252", text: latinText.replace(/^\uFEFF/, "") };
  }
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "\n" && !inQuotes) {
      lines.push(current.replace(/\r$/, ""));
      current = "";
      continue;
    }

    current += ch;
  }

  if (inQuotes) {
    throw badRequest("CSV appears truncated or corrupted (unclosed quoted field).");
  }

  if (current.length > 0) {
    lines.push(current.replace(/\r$/, ""));
  }

  return lines;
}

function parseCsvRow(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      cols.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }
  cols.push(current.trim());
  return cols;
}

function detectHeaderMapping(headers: string[], overrides?: Record<string, string>): {
  mapping: Record<string, string | null>;
  unmappedColumns: string[];
} {
  const mapping: Record<string, string | null> = {
    employee_name: null,
    employee_id: null,
    project: null,
    date: null,
    hours: null,
    amount: null,
    description: null,
    category: null,
  };

  const normalizedHeaders = headers.map((item) => normalize(item));
  for (const [canonical, aliases] of Object.entries(headerAliases)) {
    let bestHeaderIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < normalizedHeaders.length; i += 1) {
      for (const alias of aliases) {
        const distance = levenshtein(normalizedHeaders[i], alias);
        if (distance < bestScore) {
          bestScore = distance;
          bestHeaderIndex = i;
        }
      }
    }

    if (overrides?.[canonical] && headers.includes(overrides[canonical])) {
      mapping[canonical] = overrides[canonical];
      continue;
    }

    if (bestHeaderIndex >= 0 && bestScore <= 2) {
      mapping[canonical] = headers[bestHeaderIndex];
    }
  }

  const unmappedColumns = headers.filter((header) => !Object.values(mapping).includes(header));
  return { mapping, unmappedColumns };
}

function parseNumber(field: string): { value: number | null; hadNormalization: boolean } {
  const trimmed = field.trim();
  if (!trimmed) {
    return { value: null, hadNormalization: false };
  }

  const cleaned = trimmed
    .replace(/[$EURGBP\s]/gi, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.+-eE]/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    return { value: null, hadNormalization: true };
  }
  return { value, hadNormalization: cleaned !== trimmed };
}

function findEmployeeSuggestions(nameOrId: string, known: Array<{ staffId: string; fullName: string }>): string[] {
  const n = normalize(nameOrId);
  const scored = known
    .map((emp) => ({
      label: `${emp.fullName} (${emp.staffId})`,
      score: Math.min(levenshtein(n, normalize(emp.fullName)), levenshtein(n, normalize(emp.staffId))),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  return scored.map((s) => s.label);
}

export function getPreviewById(previewId: string): ImportPreview | null {
  const cached = previewCache.get(previewId);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.createdAtMs > 30 * 60 * 1000) {
    previewCache.delete(previewId);
    return null;
  }
  return cached.preview;
}

export function createImportPreview(input: PreviewInput): ImportPreview {
  const hash = createHash("sha256").update(input.fileBytes).digest("hex");
  const decoded = detectEncoding(input.fileBytes);
  const lines = splitCsvLines(decoded.text);

  if (lines.length < 2) {
    throw badRequest("CSV must include a header row and at least one data row.");
  }

  const headerCols = parseCsvRow(lines[0]);
  const { mapping, unmappedColumns } = detectHeaderMapping(headerCols, input.mappingOverrides);
  if (lines.length - 1 > MAX_ROWS) {
    throw badRequest(`CSV has ${lines.length - 1} rows, above the limit of ${MAX_ROWS}.`);
  }

  const rows: ParsedImportRow[] = [];
  const duplicateFingerprint = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const rowNumber = i + 1;
    const cols = parseCsvRow(lines[i]);
    const raw: Record<string, string> = {};
    headerCols.forEach((header, index) => {
      raw[header] = cols[index] ?? "";
    });

    const flags: ImportFlag[] = [];
    const get = (key: string): string => {
      const mapped = mapping[key];
      if (!mapped) {
        return "";
      }
      return raw[mapped] ?? "";
    };

    const employeeName = get("employee_name") || null;
    const employeeId = get("employee_id") || null;
    const projectName = get("project") || null;
    const description = get("description") || "";
    const category = get("category") || null;

    if (!mapping.employee_name && !mapping.employee_id) {
      flags.push({ code: "missing_required_field", message: "Employee column mapping is required.", requiresHuman: true });
    }

    const dateRaw = get("date");
    const dateMs = Date.parse(dateRaw);
    let dateUtc: string | null = null;
    if (!dateRaw || Number.isNaN(dateMs)) {
      flags.push({ code: "missing_required_field", message: "Valid date is required.", requiresHuman: true });
    } else {
      dateUtc = new Date(dateMs).toISOString();
      if (dateMs > Date.now()) {
        flags.push({ code: "future_date", message: "Date is in the future.", requiresHuman: true });
      }
    }

    const hoursParsed = parseNumber(get("hours"));
    const amountParsed = parseNumber(get("amount"));
    const hours = hoursParsed.value;
    const amountCents = amountParsed.value === null ? null : Math.round(amountParsed.value * 100);

    if (hoursParsed.hadNormalization || amountParsed.hadNormalization) {
      flags.push({
        code: "number_format_warning",
        message: "Numeric normalization applied (currency symbol/comma/scientific cleanup).",
        requiresHuman: false,
      });
    }

    let rowType: "time_entry" | "expense" = "time_entry";
    if (amountCents !== null && (hours === null || Number.isNaN(hours))) {
      rowType = "expense";
    }

    if (rowType === "time_entry") {
      if (hours === null) {
        flags.push({ code: "missing_required_field", message: "Hours value is required for time entry row.", requiresHuman: true });
      } else if (hours <= 0 || hours > 24) {
        flags.push({ code: "negative_or_impossible_value", message: "Hours must be > 0 and <= 24.", requiresHuman: true });
      }
    } else if (amountCents === null || amountCents < 0) {
      flags.push({ code: "negative_or_impossible_value", message: "Amount must be non-negative and valid.", requiresHuman: true });
    }

    if (input.duplicateFileHash) {
      flags.push({ code: "duplicate_file_hash", message: "File hash already imported previously.", requiresHuman: true });
    }

    const employeeLookup = employeeId || employeeName || "";
    const knownById = input.knownEmployees.find((item) => normalize(item.staffId) === normalize(employeeLookup));
    const knownByName = input.knownEmployees.find((item) => normalize(item.fullName) === normalize(employeeLookup));
    if (!knownById && !knownByName) {
      flags.push({
        code: "unknown_employee",
        message: "Employee did not match known records.",
        requiresHuman: true,
        suggestions: findEmployeeSuggestions(employeeLookup, input.knownEmployees),
      });
    }

    if (projectName && !input.knownProjects.map((v) => normalize(v)).includes(normalize(projectName))) {
      flags.push({
        code: "unknown_project",
        message: "Project/client not found.",
        requiresHuman: true,
      });
    }

    const fp = `${employeeLookup}|${dateUtc ?? ""}|${hours ?? ""}|${amountCents ?? ""}`;
    if (duplicateFingerprint.has(fp)) {
      flags.push({ code: "possible_duplicate_row", message: "Potential duplicate row in file.", requiresHuman: true });
    }
    duplicateFingerprint.add(fp);

    const parsed: ParsedImportRow = {
      rowNumber,
      rowType,
      normalized: {
        employeeName,
        employeeId,
        projectName,
        dateUtc,
        hours,
        amountCents,
        description,
        category,
      },
      raw,
      flags,
    };
    rows.push(parsed);
  }

  const skippedRows = rows.filter((r) => r.flags.some((f) => f.code === "row_parse_error"));
  const flaggedRows = rows.filter((r) => r.flags.length > 0 && !skippedRows.includes(r));
  const cleanRows = rows.filter((r) => r.flags.length === 0);

  const previewId = randomUUID();
  const preview: ImportPreview = {
    previewId,
    sourceFilename: input.sourceFilename,
    fileHashSha256: hash,
    detectedEncoding: decoded.encoding,
    mapping,
    unmappedColumns,
    cleanRows,
    flaggedRows,
    skippedRows,
    totals: {
      total: rows.length,
      clean: cleanRows.length,
      flagged: flaggedRows.length,
      skipped: skippedRows.length,
    },
  };

  previewCache.set(previewId, { preview, createdAtMs: Date.now() });
  return preview;
}
