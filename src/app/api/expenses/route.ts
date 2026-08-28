import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { forbidden } from "@/lib/domain/errors";
import { requireIdempotencyKey } from "@/lib/idempotency";
import { createExpense } from "@/lib/persistence";
import { assertHasRole } from "@/lib/rbac";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import { createExpenseSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const actor = getSessionUser(request);
    assertHasRole(actor, ["owner", "finance", "manager", "employee"]);
    assertWithinRateLimit(`${actor.userId}:POST:/api/expenses`);
    const idempotencyKey = requireIdempotencyKey(request);
    const payload = await parseRequestBody(request, createExpenseSchema);
    if (actor.role === "employee" && payload.employeeUserId !== actor.userId) {
      throw forbidden("Employees may only submit their own expenses.");
    }
    const createdResult = await createExpense(actor, payload, idempotencyKey);
    return jsonResponse(createdResult.status, createdResult.body);
  } catch (error) {
    return handleApiError(error, "POST /api/expenses");
  }
}
