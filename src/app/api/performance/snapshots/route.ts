import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";
import { listPerformanceSnapshots } from "@/lib/persistence";

export async function GET(request: Request) {
  try {
    const actor = getSessionUser(request);
    return jsonResponse(200, {
      ok: true,
      data: await listPerformanceSnapshots(actor),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/performance/snapshots");
  }
}
