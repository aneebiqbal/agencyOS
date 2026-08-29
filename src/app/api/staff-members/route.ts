import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { listStaffMembers } from "@/lib/persistence";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    const staff = await listStaffMembers(actor);
    return jsonResponse(200, { ok: true, data: staff });
  } catch (error) {
    return handleApiError(error, "GET /api/staff-members");
  }
}
