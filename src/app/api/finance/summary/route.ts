import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseQuery } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { badRequest } from "@/lib/domain/errors";
import { getFinanceSummary, logSensitiveView } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";
import { financeSummaryQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    await logSensitiveView(actor, "finance_summary", null);
    assertHasRole(actor, ["owner", "hr", "cto"]);
    const query = parseQuery(new URL(request.url), financeSummaryQuerySchema);
    if (Date.parse(query.fromUtc) > Date.parse(query.toUtc)) {
      throw badRequest("fromUtc must be earlier than or equal to toUtc.");
    }
    const summary = await getFinanceSummary(actor, query.fromUtc, query.toUtc);
    return jsonResponse(200, { ok: true, data: summary });
  } catch (error) {
    return handleApiError(error, "GET /api/finance/summary");
  }
}
