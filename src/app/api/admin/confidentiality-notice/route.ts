import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { forbidden } from "@/lib/domain/errors";
import { publishConfidentialityNotice } from "@/lib/persistence";
import { publishConfidentialityNoticeSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const actor = await getSessionUser(request);
    if (actor.role !== "owner") {
      throw forbidden("Only owner may publish confidentiality notices.");
    }

    const payload = await parseRequestBody(request, publishConfidentialityNoticeSchema);
    await publishConfidentialityNotice(actor, payload.version, payload.noticeText);

    return jsonResponse(201, {
      ok: true,
      data: {
        version: payload.version,
      },
    });
  } catch (error) {
    return handleApiError(error, "POST /api/admin/confidentiality-notice");
  }
}
