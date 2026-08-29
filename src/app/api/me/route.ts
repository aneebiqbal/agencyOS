import { getSessionUser, listProvisionedOrgIdsForUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request, { allowCoreAccessViolation: true });
    const availableOrgIds = await listProvisionedOrgIdsForUser(actor.userId);
    return jsonResponse(200, {
      ok: true,
      data: {
        userId: actor.userId,
        role: actor.role,
        orgId: actor.orgId,
        availableOrgIds,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/me");
  }
}
