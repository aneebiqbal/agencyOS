import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { requireIdempotencyKey } from "@/lib/idempotency";
import { createExpense } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import { createExpenseSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    assertHasRole(actor, ["owner", "hr", "cto"]);
    assertWithinRateLimit(`${actor.userId}:POST:/api/expenses`);
    const idempotencyKey = requireIdempotencyKey(request);
    const payload = await parseRequestBody(request, createExpenseSchema);
    const createdResult = await createExpense(actor, payload, idempotencyKey);
    return jsonResponse(createdResult.status, createdResult.body);
  } catch (error) {
    return handleApiError(error, "POST /api/expenses");
  }
}
