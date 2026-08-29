import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import { POST as signOut } from "@/app/api/auth/signout/route";
import { GET as listProjects } from "@/app/api/projects/route";
import { isPostgresConfigured } from "@/lib/db/postgres";
import { createAuthToken, setupFreshState } from "../helpers";

const describeIfPostgres = isPostgresConfigured() ? describe : describe.skip;

describeIfPostgres("auth session lifecycle", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes expired access token when refresh token is valid", async () => {
    const expiredToken = await createAuthToken("hr", "hr-1", { expiresIn: "-10s" });
    const refreshedToken = await createAuthToken("hr", "hr-1", { expiresIn: "1h" });

    const baseFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: refreshedToken }), { status: 200 }));
      }
      return baseFetch(input, init);
    });

    const response = await listProjects(
      new Request("http://localhost/api/projects", {
        method: "GET",
        headers: {
          authorization: `Bearer ${expiredToken}`,
          "x-refresh-token": "refresh-token-valid",
        },
      }),
    );

    expect(response.status).toBe(200);
  });

  it("returns 401 when refresh token is invalid or expired", async () => {
    const expiredToken = await createAuthToken("hr", "hr-1", { expiresIn: "-10s" });
    const baseFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
        return Promise.resolve(new Response("invalid refresh", { status: 401 }));
      }
      return baseFetch(input, init);
    });

    const response = await listProjects(
      new Request("http://localhost/api/projects", {
        method: "GET",
        headers: {
          authorization: `Bearer ${expiredToken}`,
          "x-refresh-token": "refresh-token-expired",
        },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("invalidates session on sign-out and blocks token reuse", async () => {
    const activeToken = await createAuthToken("hr", "hr-1", { expiresIn: "1h" });
    const signOutResponse = await signOut(
      new Request("http://localhost/api/auth/signout", {
        method: "POST",
        headers: {
          authorization: `Bearer ${activeToken}`,
        },
      }),
    );
    expect(signOutResponse.status).toBe(200);

    const reusedResponse = await listProjects(
      new Request("http://localhost/api/projects", {
        method: "GET",
        headers: {
          authorization: `Bearer ${activeToken}`,
        },
      }),
    );
    expect(reusedResponse.status).toBe(401);
  });
});
