import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { markDealWonAndCreateProject } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import { winDealSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ dealId: string }> },
) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    assertHasRole(actor, ["owner", "hr", "cto"]);
    assertWithinRateLimit(`${actor.userId}:POST:/api/deals/win`);
    const payload = await parseRequestBody(request, winDealSchema);
    const { dealId } = await context.params;

    const result = await markDealWonAndCreateProject(actor, dealId, payload);
    return jsonResponse(200, {
      ok: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/deals/[dealId]/win");
  }
}
