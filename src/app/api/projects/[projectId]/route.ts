import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { notFound } from "@/lib/domain/errors";
import { findProjectById, listProjectMemberUserIds } from "@/lib/persistence";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    const { projectId } = await context.params;

    const project = await findProjectById(actor, projectId);
    if (!project) {
      throw notFound("Project not found.");
    }

    const members = await listProjectMemberUserIds(actor, projectId);
    return jsonResponse(200, {
      ok: true,
      data: {
        project,
        members,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/projects/[projectId]");
  }
}
