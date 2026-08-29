import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { undoImportBatch } from "@/lib/persistence";
import { importUndoSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    const payload = await parseRequestBody(request, importUndoSchema);
    const { batchId } = await context.params;
    await undoImportBatch(actor, batchId, payload.reason);
    return jsonResponse(200, { ok: true, data: { batchId, voided: true } });
  } catch (error) {
    return handleApiError(error, "POST /api/imports/[batchId]/undo");
  }
}
