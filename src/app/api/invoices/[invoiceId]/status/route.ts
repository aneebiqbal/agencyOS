import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { updateInvoiceStatus } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";
import { updateInvoiceStatusSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    assertHasRole(actor, ["owner", "hr", "cto"]);
    const payload = await parseRequestBody(request, updateInvoiceStatusSchema);
    const { invoiceId } = await context.params;

    const updated = await updateInvoiceStatus(actor, invoiceId, payload.status);
    return jsonResponse(200, { ok: true, data: updated });
  } catch (error) {
    return handleApiError(error, "PATCH /api/invoices/[invoiceId]/status");
  }
}
