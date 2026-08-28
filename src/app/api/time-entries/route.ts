import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { forbidden } from "@/lib/domain/errors";
import { requireIdempotencyKey } from "@/lib/idempotency";
import { createTimeEntry, findProjectById, isProjectMember } from "@/lib/persistence";
import { canAccessProject } from "@/lib/rbac";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import { createTimeEntrySchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const actor = getSessionUser(request);
    assertWithinRateLimit(`${actor.userId}:POST:/api/time-entries`);
    const idempotencyKey = requireIdempotencyKey(request);
    const payload = await parseRequestBody(request, createTimeEntrySchema);
    const project = await findProjectById(actor, payload.projectId);
    if (!project) {
      throw forbidden("Cannot log time against a project you cannot access.");
    }

    const isMember = await isProjectMember(actor, payload.projectId, actor.userId);

    if (!canAccessProject(actor, project, isMember)) {
      throw forbidden("Cannot log time against a project you cannot access.");
    }

    if (actor.role === "employee" && payload.employeeUserId !== actor.userId) {
      throw forbidden("Employees may only submit time for themselves.");
    }

    const createdResult = await createTimeEntry(actor, payload, idempotencyKey);
    return jsonResponse(createdResult.status, createdResult.body);
  } catch (error) {
    return handleApiError(error, "POST /api/time-entries");
  }
}
