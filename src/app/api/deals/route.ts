import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { listDeals } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    assertHasRole(actor, ["owner", "hr", "cto"]);

    return jsonResponse(200, {
      ok: true,
      data: await listDeals(actor),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/deals");
  }
}
