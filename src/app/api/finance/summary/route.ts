import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseQuery } from "@/lib/api";
import { badRequest } from "@/lib/domain/errors";
import { getFinanceSummary } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";
import { financeSummaryQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const actor = getSessionUser(request);
    assertHasRole(actor, ["owner", "finance"]);
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
