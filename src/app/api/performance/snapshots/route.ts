import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { assertConfidentialityAcknowledged } from "@/lib/confidentiality";
import { listPerformanceSnapshots, logSensitiveView } from "@/lib/persistence";

export async function GET(request: Request) {
  try {
    const actor = await getSessionUser(request);
    await assertConfidentialityAcknowledged(actor);
    await logSensitiveView(actor, "performance_snapshots", null);
    return jsonResponse(200, {
      ok: true,
      data: await listPerformanceSnapshots(actor),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/performance/snapshots");
  }
}
