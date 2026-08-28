import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { forbidden, notFound } from "@/lib/domain/errors";
import { findProjectById, isProjectMember, updateProjectBudget } from "@/lib/persistence";
import { canAccessProject } from "@/lib/rbac";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import { updateProjectBudgetSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = getSessionUser(request);
    assertWithinRateLimit(`${actor.userId}:PATCH:/api/projects/budget`);
    const payload = await parseRequestBody(request, updateProjectBudgetSchema);
    const { projectId } = await context.params;
    const project = await findProjectById(actor, projectId);
    if (!project) {
      throw notFound("Project not found.");
    }

    const isMember = await isProjectMember(actor, project.id, actor.userId);
    if (!canAccessProject(actor, project, isMember)) {
      throw forbidden();
    }

    const updated = await updateProjectBudget(
      actor,
      project.id,
      payload.budgetCents,
      payload.expectedVersion,
    );

    return jsonResponse(200, {
      ok: true,
      data: updated,
    });
  } catch (error) {
    return handleApiError(error, "PATCH /api/projects/[projectId]/budget");
  }
}
