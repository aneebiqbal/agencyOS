import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { createImportPreview } from "@/lib/import-pipeline";
import { hasImportedFileHash, listProjectNames, listStaffMembers } from "@/lib/persistence";
import { importPreviewSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    const payload = await parseRequestBody(request, importPreviewSchema);

    const fileBytes = Buffer.from(payload.csvBase64, "base64");
    const knownEmployees = await listStaffMembers(actor);
    const knownProjects = await listProjectNames(actor);

    const preview = createImportPreview({
      sourceFilename: payload.sourceFilename,
      fileBytes,
      mappingOverrides: payload.mappingOverrides,
      knownEmployees,
      knownProjects,
      duplicateFileHash: false,
    });

    const duplicateFileHash = await hasImportedFileHash(actor, preview.fileHashSha256);
    if (duplicateFileHash) {
      for (const row of preview.cleanRows) {
        row.flags.push({
          code: "duplicate_file_hash",
          message: "This exact file hash has already been imported.",
          requiresHuman: true,
        });
      }
      preview.flaggedRows.push(...preview.cleanRows.splice(0));
      preview.totals.clean = preview.cleanRows.length;
      preview.totals.flagged = preview.flaggedRows.length;
    }

    return jsonResponse(200, {
      ok: true,
      data: preview,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/imports/preview");
  }
}
