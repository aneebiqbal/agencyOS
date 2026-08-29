import { getSessionUser, signOutSession } from "@/lib/auth";
import { handleApiError, jsonResponse } from "@/lib/api";

export async function POST(request: Request) {
  try {
    await getSessionUser(request);
    await signOutSession(request);
    return jsonResponse(200, {
      ok: true,
      data: { signedOut: true },
    });
  } catch (error) {
    return handleApiError(error, "POST /api/auth/signout");
  }
}
