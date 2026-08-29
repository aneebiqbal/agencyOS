import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { getLatestConfidentialityNotice, hasAcknowledgedConfidentiality } from "@/lib/persistence";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request, { allowCoreAccessViolation: true });
    const notice = await getLatestConfidentialityNotice(actor);
    if (!notice) {
      return jsonResponse(409, {
        ok: false,
        code: "CONFIDENTIALITY_NOTICE_NOT_CONFIGURED",
        message: "Confidentiality notice is not configured. Owner must publish a notice version.",
      });
    }
    const acknowledged = await hasAcknowledgedConfidentiality(actor, notice.version);
    return jsonResponse(200, {
      ok: true,
      data: {
        needsAcknowledgement: !acknowledged,
        noticeVersion: notice.version,
        noticeText: notice.noticeText,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/confidentiality/status");
  }
}
