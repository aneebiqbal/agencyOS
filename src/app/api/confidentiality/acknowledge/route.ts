import { z } from "zod";

import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { acknowledgeConfidentiality } from "@/lib/persistence";

const schema = z.object({
  version: z.string().min(1),
  acknowledged: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const actor = await getSessionUser(request, { allowCoreAccessViolation: true });
    const payload = await parseRequestBody(request, schema);
    await acknowledgeConfidentiality(actor, payload.version);
    return jsonResponse(200, { ok: true, data: { acknowledged: true } });
  } catch (error) {
    return handleApiError(error, "POST /api/confidentiality/acknowledge");
  }
}
