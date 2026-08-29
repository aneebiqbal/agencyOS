import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { forbidden } from "@/lib/domain/errors";
import { listStaffDirectory } from "@/lib/persistence";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request, { allowCoreAccessViolation: true });
    if (actor.role !== "owner" && actor.role !== "hr") {
      throw forbidden("Only owner or hr can view staff compensation.");
    }
    const rows = await listStaffDirectory(actor);
    return jsonResponse(200, { ok: true, data: rows });
  } catch (error) {
    return handleApiError(error, "GET /api/staff-directory");
  }
}
