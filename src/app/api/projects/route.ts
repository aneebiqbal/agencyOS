import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { listProjects } from "@/lib/persistence";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    const projects = await listProjects(actor);

    return jsonResponse(200, {
      ok: true,
      data: projects,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/projects");
  }
}
