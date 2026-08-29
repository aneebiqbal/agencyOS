import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";

import { __resetAuthCachesForTests } from "@/lib/auth";
import { resetRateLimitBucketsForTests } from "@/lib/rate-limit";
import { resetPersistenceForTests } from "@/lib/persistence";

const TEST_JWKS_KID = "test-kid-1";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.local";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "anon-test-key";

let signingMaterialPromise: Promise<{ privateKey: CryptoKey; publicJwk: JWK }> | null = null;

async function getSigningMaterial(): Promise<{ privateKey: CryptoKey; publicJwk: JWK }> {
  if (!signingMaterialPromise) {
    signingMaterialPromise = (async () => {
      const { privateKey, publicKey } = await generateKeyPair("RS256");
      const publicJwk = await exportJWK(publicKey);
      return {
        privateKey,
        publicJwk: {
          ...publicJwk,
          use: "sig",
          alg: "RS256",
          kid: TEST_JWKS_KID,
        },
      };
    })();
  }
  return signingMaterialPromise;
}

const nativeFetch = globalThis.fetch.bind(globalThis);
let jwksFetchInstalled = false;

function ensureTestJwksFetch(): void {
  if (jwksFetchInstalled) {
    return;
  }
  const jwksUrl = `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === jwksUrl) {
      const { publicJwk } = await getSigningMaterial();
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return nativeFetch(input, init);
  };
  jwksFetchInstalled = true;
}

export async function createAuthToken(
  role = "owner",
  userId = "owner-1",
  options?: { expiresIn?: string },
): Promise<string> {
  ensureTestJwksFetch();
  const { privateKey } = await getSigningMaterial();
  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: "RS256", kid: TEST_JWKS_KID })
    .setSubject(userId)
    .setJti(`jti-${userId}-${Date.now()}-${Math.random()}`)
    .setIssuedAt()
    .setExpirationTime(options?.expiresIn ?? "1h")
    .sign(privateKey);

  return token;
}

export async function authHeaders(role = "owner", userId = "owner-1", extras?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extras);
  const token = await createAuthToken(role, userId);

  headers.set("authorization", `Bearer ${token}`);
  return headers;
}

export async function setupFreshState(): Promise<void> {
  ensureTestJwksFetch();
  __resetAuthCachesForTests();
  await resetPersistenceForTests();
  resetRateLimitBucketsForTests();
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}
