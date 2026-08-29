import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { forbidden } from "@/lib/domain/errors";
import { upsertStaffCompensation } from "@/lib/persistence";
import { upsertStaffCompensationSchema } from "@/lib/validation";

interface Context {
  params: Promise<{ staffId: string }>;
}

export async function PUT(request: Request, context: Context) {
  try {
    const actor = await getSessionUser(request, { allowCoreAccessViolation: true });
    if (actor.role !== "owner" && actor.role !== "hr") {
      throw forbidden("Only owner or hr can update compensation.");
    }

    const payload = await parseRequestBody(request, upsertStaffCompensationSchema);
    const { staffId } = await context.params;
    await upsertStaffCompensation(actor, staffId, {
      employmentType: payload.employmentType,
      annualSalaryCents: payload.annualSalaryCents ?? null,
      hourlyRateCents: payload.hourlyRateCents ?? null,
      currency: payload.currency,
    });

    return jsonResponse(200, { ok: true, data: { staffId } });
  } catch (error) {
    return handleApiError(error, "PUT /api/staff-members/:staffId/compensation");
  }
}
