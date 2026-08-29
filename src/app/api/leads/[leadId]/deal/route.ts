import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { createOpenDealForLead } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";

export async function POST(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    assertHasRole(actor, ["owner", "hr", "cto"]);

    const { leadId } = await context.params;
    const deal = await createOpenDealForLead(actor, leadId);
    return jsonResponse(201, { ok: true, data: deal });
  } catch (error) {
    return handleApiError(error, "POST /api/leads/[leadId]/deal");
  }
}
