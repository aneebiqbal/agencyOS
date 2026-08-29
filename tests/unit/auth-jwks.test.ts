import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";

import { getSessionUser, __resetAuthCachesForTests } from "@/lib/auth";

async function buildSignedToken(privateKey: CryptoKey, kid: string, userId = "owner-1"): Promise<string> {
  return new SignJWT({ role: "owner" })
    .setProtectedHeader({ alg: "RS256", kid })
    .setSubject(userId)
    .setJti(`jti-${kid}-${Date.now()}-${Math.random()}`)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

describe("JWKS token verification", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.local";
    process.env.SUPABASE_ANON_KEY = "anon-test-key";
    __resetAuthCachesForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetAuthCachesForTests();
  });

  it("verifies token signed by cached JWKS key", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk: JWK = { ...(await exportJWK(publicKey)), use: "sig", alg: "RS256", kid: "k1" };
    const token = await buildSignedToken(privateKey, "k1");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const user = await getSessionUser(
      new Request("http://localhost/api/projects", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(user.userId).toBe("owner-1");
    expect(user.role).toBe("owner");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects token signed by wrong private key", async () => {
    const goodKey = await generateKeyPair("RS256");
    const badKey = await generateKeyPair("RS256");
    const publicJwk: JWK = { ...(await exportJWK(goodKey.publicKey)), use: "sig", alg: "RS256", kid: "k1" };
    const token = await buildSignedToken(badKey.privateKey, "k1");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      getSessionUser(
        new Request("http://localhost/api/projects", {
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("refetches JWKS once for unknown kid and negative-caches misses", async () => {
    const goodKey = await generateKeyPair("RS256");
    const unknownKidKey = await generateKeyPair("RS256");
    const publicJwk: JWK = { ...(await exportJWK(goodKey.publicKey)), use: "sig", alg: "RS256", kid: "k1" };
    const token = await buildSignedToken(unknownKidKey.privateKey, "rotated-kid");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      getSessionUser(
        new Request("http://localhost/api/projects", {
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await expect(
      getSessionUser(
        new Request("http://localhost/api/projects", {
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
