import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { retryInvoiceSend } from "@/lib/persistence";

export async function POST(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    const { invoiceId } = await context.params;
    const invoice = await retryInvoiceSend(actor, invoiceId);
    return jsonResponse(200, { ok: true, data: invoice });
  } catch (error) {
    return handleApiError(error, "POST /api/invoices/[invoiceId]/retry-send");
  }
}
