import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { getLatestConfidentialityNotice, hasAcknowledgedConfidentiality } from "@/lib/persistence";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request);
    const notice = await getLatestConfidentialityNotice(actor);
    if (!notice) {
      return jsonResponse(200, { ok: true, data: { needsAcknowledgement: false, noticeVersion: null } });
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
