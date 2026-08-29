import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { getPreviewById } from "@/lib/import-pipeline";
import { badRequest } from "@/lib/domain/errors";
import { confirmImportBatch } from "@/lib/persistence";
import { importConfirmSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    const payload = await parseRequestBody(request, importConfirmSchema);
    const preview = getPreviewById(payload.previewId);
    if (!preview) {
      throw badRequest("Preview expired or not found. Upload again and re-run preview.");
    }

    const rowEmployeeLinks = Object.fromEntries(
      Object.entries(payload.rowEmployeeLinks).map(([key, value]) => [Number(key), value]),
    ) as Record<number, string>;
    const rowProjectDecisions = Object.fromEntries(
      Object.entries(payload.rowProjectDecisions).map(([key, value]) => [Number(key), value]),
    ) as Record<number, { action: "use_existing" | "create_project" | "skip"; projectName?: string }>;

    const committed = await confirmImportBatch(actor, preview, {
      forceReimport: payload.forceReimport,
      rowEmployeeLinks,
      rowProjectDecisions,
    });

    return jsonResponse(201, {
      ok: true,
      data: committed,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/imports/confirm");
  }
}
