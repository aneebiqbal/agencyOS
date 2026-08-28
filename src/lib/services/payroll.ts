import type { DataStore } from "@/lib/db/store";
import type { PayrollRunSummary } from "@/lib/domain/types";

export function listPayrollRuns(store: DataStore): PayrollRunSummary[] {
  return store.getState().payrollRuns;
}
