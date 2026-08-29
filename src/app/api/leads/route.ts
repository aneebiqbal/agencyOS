import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { createLead, listLeads } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import { createLeadSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    assertHasRole(actor, ["owner", "hr", "cto"]);

    return jsonResponse(200, {
      ok: true,
      data: await listLeads(actor),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/leads");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    assertHasRole(actor, ["owner", "hr", "cto"]);
    assertWithinRateLimit(`${actor.userId}:POST:/api/leads`);
    const payload = await parseRequestBody(request, createLeadSchema);

    const lead = await createLead(actor, payload);
    return jsonResponse(201, {
      ok: true,
      data: lead,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/leads");
  }
}
