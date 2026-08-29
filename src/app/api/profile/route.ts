import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { forbidden } from "@/lib/domain/errors";
import { updateMyProfileDisplayName } from "@/lib/persistence";
import { updateProfileSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  try {
    const actor = await getSessionUser(request);
    const payload = await parseRequestBody(request, updateProfileSchema);

    if (payload.role) {
      // Business rule: role changes are admin-controlled only and never writable via self-profile updates.
      throw forbidden("Role cannot be modified through profile updates.");
    }

    const updated = await updateMyProfileDisplayName(actor, payload.displayName ?? "");
    return jsonResponse(200, {
      ok: true,
      data: updated,
    });
  } catch (error) {
    return handleApiError(error, "PATCH /api/profile");
  }
}
