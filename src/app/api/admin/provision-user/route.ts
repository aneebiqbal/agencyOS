import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { queryAsActor, isPostgresConfigured } from "@/lib/db/postgres";
import { conflict, forbidden } from "@/lib/domain/errors";
import { provisionUserSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const actor = await getSessionUser(request, { allowCoreAccessViolation: true });
    if (actor.role !== "owner") {
      throw forbidden("Only owner may provision core users.");
    }

    const payload = await parseRequestBody(request, provisionUserSchema);

    if (!isPostgresConfigured()) {
      throw conflict("Core access model is fixed to exactly 3 provisioned accounts.");
    }

    const activeRows = await queryAsActor<{ user_id: string; role: string }>(
      { userId: actor.userId, role: actor.role, orgId: actor.orgId },
      `select user_id, role::text as role
         from app.employees
        where org_id = $1 and deleted_at_utc is null`,
      [actor.orgId],
    );

    if (activeRows.some((row) => row.user_id === payload.userId)) {
      throw conflict("User is already provisioned in this organization.");
    }

    if (activeRows.length >= 3) {
      throw conflict("Cannot provision a fourth account; core model allows exactly 3 active accounts.");
    }

    if (activeRows.some((row) => row.role === payload.role)) {
      throw conflict(`Role ${payload.role} is already assigned to another active core account.`);
    }

    await queryAsActor(
      { userId: actor.userId, role: actor.role, orgId: actor.orgId },
      `insert into app.employees (org_id, user_id, role, email, full_name, deleted_at_utc)
       values ($1, $2, $3::app.user_role, $4, $5, null)`,
      [actor.orgId, payload.userId, payload.role, payload.email, payload.fullName],
    );

    return jsonResponse(201, {
      ok: true,
      data: {
        userId: payload.userId,
        role: payload.role,
      },
    });
  } catch (error) {
    return handleApiError(error, "POST /api/admin/provision-user");
  }
}
