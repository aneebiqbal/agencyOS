import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { listPayrollRuns, logSensitiveView } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    assertHasRole(actor, ["owner", "hr", "cto"]);
    await logSensitiveView(actor, "payroll_runs", null);
    return jsonResponse(200, {
      ok: true,
      data: await listPayrollRuns(actor),
      note: "Read-only payroll summaries. Statutory calculations remain in payroll provider.",
    });
  } catch (error) {
    return handleApiError(error, "GET /api/payroll/runs");
  }
}
