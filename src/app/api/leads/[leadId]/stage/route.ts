import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { updateLeadStage } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";
import { updateLeadStageSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    assertHasRole(actor, ["owner", "hr", "cto"]);
    const payload = await parseRequestBody(request, updateLeadStageSchema);
    const { leadId } = await context.params;

    const updated = await updateLeadStage(actor, leadId, payload.stage);
    return jsonResponse(200, {
      ok: true,
      data: updated,
    });
  } catch (error) {
    return handleApiError(error, "PATCH /api/leads/[leadId]/stage");
  }
}
