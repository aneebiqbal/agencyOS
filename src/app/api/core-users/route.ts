import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { listCoreUsers } from "@/lib/persistence";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request, { allowCoreAccessViolation: true });
    const users = await listCoreUsers(actor);
    return jsonResponse(200, { ok: true, data: users });
  } catch (error) {
    return handleApiError(error, "GET /api/core-users");
  }
}
