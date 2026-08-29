import { z } from "zod";

import { handleApiError, jsonResponse, parseRequestBody } from "@/lib/api";
import { badRequest, unauthorized } from "@/lib/domain/errors";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw badRequest(`${name} is required to enable login. Set it in your local environment.`);
  }
  return value;
}

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, loginSchema);
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      error_description?: string;
      msg?: string;
    };

    if (!response.ok) {
      throw unauthorized(body.error_description ?? body.msg ?? "Invalid credentials or unprovisioned account.");
    }

    if (!body.access_token) {
      throw badRequest("Supabase auth response did not include an access token.");
    }

    return jsonResponse(200, {
      ok: true,
      data: {
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? null,
        expiresIn: body.expires_in ?? null,
        tokenType: body.token_type ?? "bearer",
      },
    });
  } catch (error) {
    return handleApiError(error, "POST /api/auth/login");
  }
}
