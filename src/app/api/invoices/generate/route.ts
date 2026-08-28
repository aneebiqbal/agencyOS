import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { findProjectById, generateInvoiceFromProjectTime, isProjectMember } from "@/lib/persistence";
import { forbidden, notFound } from "@/lib/domain/errors";
import { canAccessProject } from "@/lib/rbac";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import { generateInvoiceSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const actor = getSessionUser(request);
    assertWithinRateLimit(`${actor.userId}:POST:/api/invoices/generate`);
    const payload = await parseRequestBody(request, generateInvoiceSchema);
    const project = await findProjectById(actor, payload.projectId);
    if (!project) {
      throw notFound("Project not found.");
    }

    const isMember = await isProjectMember(actor, payload.projectId, actor.userId);

    if (!canAccessProject(actor, project, isMember)) {
      throw forbidden();
    }

    const result = await generateInvoiceFromProjectTime(actor, payload);
    return jsonResponse(201, {
      ok: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/invoices/generate");
  }
}
