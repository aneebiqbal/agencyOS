import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { listAuditLogs } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    const actor = getSessionUser(request);
    assertHasRole(actor, ["owner", "finance"]);
    return jsonResponse(200, {
      ok: true,
      data: await listAuditLogs(actor),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/audit-logs");
  }
}
