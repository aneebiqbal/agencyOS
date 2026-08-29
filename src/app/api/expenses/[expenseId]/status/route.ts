import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { updateExpenseStatus } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";
import { updateExpenseStatusSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ expenseId: string }> },
) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    assertHasRole(actor, ["owner", "hr", "cto"]);
    const payload = await parseRequestBody(request, updateExpenseStatusSchema);
    const { expenseId } = await context.params;

    const updated = await updateExpenseStatus(actor, expenseId, payload.status);
    return jsonResponse(200, {
      ok: true,
      data: updated,
    });
  } catch (error) {
    return handleApiError(error, "PATCH /api/expenses/[expenseId]/status");
  }
}
