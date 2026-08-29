import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { listInvoices } from "@/lib/persistence";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    return jsonResponse(200, {
      ok: true,
      data: await listInvoices(actor),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/invoices");
  }
}
