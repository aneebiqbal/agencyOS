import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { forbidden } from "@/lib/domain/errors";
import { createStaffMember, listStaffMembers } from "@/lib/persistence";
import { createStaffMemberSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request, { allowCoreAccessViolation: true });
    await assertConfidentialityAcknowledged(actor);
    const staff = await listStaffMembers(actor);
    return jsonResponse(200, { ok: true, data: staff });
  } catch (error) {
    return handleApiError(error, "GET /api/staff-members");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getSessionUser(request, { allowCoreAccessViolation: true });
    if (actor.role !== "owner" && actor.role !== "hr") {
      throw forbidden("Only owner or hr can add staff members.");
    }

    const payload = await parseRequestBody(request, createStaffMemberSchema);
    const created = await createStaffMember(actor, payload);
    return jsonResponse(201, { ok: true, data: created });
  } catch (error) {
    return handleApiError(error, "POST /api/staff-members");
  }
}
