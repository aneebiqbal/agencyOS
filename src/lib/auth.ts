import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  errors as joseErrors,
  type JWTPayload,
  type JSONWebKeySet,
} from "jose";

import { isPostgresConfigured, querySystem } from "@/lib/db/postgres";
import { unauthorized, forbidden, conflict } from "@/lib/domain/errors";
import type { SessionUser, UserRole } from "@/lib/domain/types";

interface VerifiedToken {
  payload: JWTPayload;
}

interface JwksCacheState {
  verifier: ReturnType<typeof createLocalJWKSet> | null;
  fetchedAtMs: number;
  expiresAtMs: number;
  inFlightRefresh: Promise<void> | null;
  unknownKidUntilMs: Map<string, number>;
}

const memoryEmployeeProvisioning: Record<string, { orgId: string; role: UserRole; email: string }> = {
  "owner-1": { orgId: "org-core-1", role: "owner", email: "owner@agency.local" },
  "hr-1": { orgId: "org-core-1", role: "hr", email: "hr@agency.local" },
  "cto-1": { orgId: "org-core-1", role: "cto", email: "cto@agency.local" },
};

const revokedMemoryTokens = new Set<string>();
const JWKS_CACHE_TTL_MS = 5 * 60_000;
const JWKS_UNKNOWN_KID_TTL_MS = 30_000;

const jwksCache: JwksCacheState = {
  verifier: null,
  fetchedAtMs: 0,
  expiresAtMs: 0,
  inFlightRefresh: null,
  unknownKidUntilMs: new Map<string, number>(),
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required for Supabase auth.`);
  }
  return value;
}

function assertAuthWiringAtStartup(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_ANON_KEY");
}

function getJwksUrl(): string {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  return `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
}

function rememberUnknownKid(kid: string): void {
  jwksCache.unknownKidUntilMs.set(kid, Date.now() + JWKS_UNKNOWN_KID_TTL_MS);
}

function isUnknownKidCached(kid: string): boolean {
  const untilMs = jwksCache.unknownKidUntilMs.get(kid);
  if (!untilMs) {
    return false;
  }
  if (untilMs <= Date.now()) {
    jwksCache.unknownKidUntilMs.delete(kid);
    return false;
  }
  return true;
}

function isNoMatchingJwkError(error: unknown): boolean {
  if (error instanceof joseErrors.JWKSNoMatchingKey) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const lowered = error.message.toLowerCase();
  return lowered.includes("no applicable key") || lowered.includes("no matching key");
}

async function refreshJwks(force: boolean): Promise<void> {
  const now = Date.now();
  if (!force && jwksCache.verifier && now < jwksCache.expiresAtMs) {
    return;
  }

  if (jwksCache.inFlightRefresh) {
    await jwksCache.inFlightRefresh;
    return;
  }

  jwksCache.inFlightRefresh = (async () => {
    const response = await fetch(getJwksUrl(), {
      headers: {
        apikey: requireEnv("SUPABASE_ANON_KEY"),
      },
    });
    if (!response.ok) {
      throw unauthorized("Unable to load Supabase JWKS for session verification.");
    }

    const parsed = (await response.json()) as Partial<JSONWebKeySet>;
    if (!parsed.keys || !Array.isArray(parsed.keys) || parsed.keys.length === 0) {
      throw unauthorized("Supabase JWKS response did not include any keys.");
    }

    const jwks: JSONWebKeySet = { keys: parsed.keys };
    jwksCache.verifier = createLocalJWKSet(jwks);
    jwksCache.fetchedAtMs = Date.now();
    jwksCache.expiresAtMs = jwksCache.fetchedAtMs + JWKS_CACHE_TTL_MS;

    for (const [kid, untilMs] of jwksCache.unknownKidUntilMs.entries()) {
      if (untilMs <= jwksCache.fetchedAtMs) {
        jwksCache.unknownKidUntilMs.delete(kid);
      }
    }
  })();

  try {
    await jwksCache.inFlightRefresh;
  } finally {
    jwksCache.inFlightRefresh = null;
  }
}

async function verifyWithCachedJwks(token: string): Promise<VerifiedToken> {
  if (!jwksCache.verifier) {
    throw unauthorized("Session verification keys are unavailable.");
  }
  const verified = await jwtVerify(token, jwksCache.verifier, {
    algorithms: ["RS256", "ES256"],
  });
  return { payload: verified.payload };
}

function getBearerToken(request: Request): string {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw unauthorized("Missing bearer session token.");
  }
  return authHeader.slice(7).trim();
}

function getRefreshToken(request: Request): string | null {
  const refreshHeader = request.headers.get("x-refresh-token");
  if (refreshHeader && refreshHeader.trim().length > 0) {
    return refreshHeader.trim();
  }

  const cookie = request.headers.get("cookie") ?? "";
  const parts = cookie.split(";").map((part) => part.trim());
  const refresh = parts.find((part) => part.startsWith("sb-refresh-token="));
  if (!refresh) {
    return null;
  }
  return decodeURIComponent(refresh.replace("sb-refresh-token=", ""));
}

async function verifyAccessToken(token: string): Promise<VerifiedToken> {
  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw unauthorized("Invalid session token.");
  }
  const kid = typeof header.kid === "string" ? header.kid : null;
  if (!kid) {
    throw unauthorized("Session token header is missing a key id (kid).");
  }

  await refreshJwks(false);

  if (isUnknownKidCached(kid)) {
    throw unauthorized("Invalid session token.");
  }

  try {
    return await verifyWithCachedJwks(token);
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      throw error;
    }

    if (isNoMatchingJwkError(error)) {
      if (isUnknownKidCached(kid)) {
        throw unauthorized("Invalid session token.");
      }

      rememberUnknownKid(kid);
      await refreshJwks(true);
      try {
        const verified = await verifyWithCachedJwks(token);
        jwksCache.unknownKidUntilMs.delete(kid);
        return verified;
      } catch (retryError) {
        if (retryError instanceof joseErrors.JWTExpired) {
          throw retryError;
        }
        if (isNoMatchingJwkError(retryError)) {
          throw unauthorized("Invalid session token.");
        }
        throw unauthorized("Invalid session token.");
      }
    }

    throw unauthorized("Invalid session token.");
  }
}

async function refreshSupabaseSession(refreshToken: string): Promise<string> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    throw unauthorized("Session expired. Please sign in again.");
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw unauthorized("Session refresh failed. Please sign in again.");
  }

  return data.access_token;
}

async function verifyWithRefresh(request: Request): Promise<VerifiedToken> {
  const currentToken = getBearerToken(request);

  try {
    return await verifyAccessToken(currentToken);
  } catch (error) {
    if (!(error instanceof joseErrors.JWTExpired)) {
      throw unauthorized("Invalid session token.");
    }

    const refreshToken = getRefreshToken(request);
    if (!refreshToken) {
      throw unauthorized("Session expired and no refresh token was provided.");
    }

    const refreshedAccessToken = await refreshSupabaseSession(refreshToken);
    return verifyAccessToken(refreshedAccessToken);
  }
}

function asRole(value: string): UserRole {
  if (value === "owner" || value === "hr" || value === "cto") {
    return value;
  }
  throw forbidden("User role is not provisioned for Agency OS.");
}

const CORE_ACCESS_CHECK_INTERVAL_MS = 60_000;
const REQUIRED_CORE_ROLES: UserRole[] = ["owner", "hr", "cto"];
const lastCoreAccessValidationMsByScope = new Map<string, number>();
const warnedCoreAccessScopes = new Set<string>();

function coreAccessError(source: "startup" | "request", message: string): Error {
  return source === "request" ? conflict(message) : new Error(message);
}

function noteCoreAccessWarning(scopeKey: string, source: "startup" | "request", message: string): void {
  if (source === "request" || process.env.NODE_ENV === "production") {
    throw coreAccessError(source, message);
  }
  if (warnedCoreAccessScopes.has(scopeKey) && source !== "startup") {
    return;
  }
  warnedCoreAccessScopes.add(scopeKey);
  console.warn(message);
}

function assertExactCoreRolesForScope(
  source: "startup" | "request",
  scopeKey: string,
  scopeLabel: string,
  roles: string[],
): void {
  if (roles.length !== REQUIRED_CORE_ROLES.length) {
    noteCoreAccessWarning(
      scopeKey,
      source,
      `Core access model violation (${scopeLabel}): exactly 3 active accounts are required.`,
    );
    return;
  }

  const counts = new Map<UserRole, number>(REQUIRED_CORE_ROLES.map((role) => [role, 0]));

  for (const role of roles) {
    if (role !== "owner" && role !== "hr" && role !== "cto") {
      noteCoreAccessWarning(
        scopeKey,
        source,
        `Core access model violation (${scopeLabel}): invalid role detected outside owner/hr/cto.`,
      );
      return;
    }
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }

  for (const role of REQUIRED_CORE_ROLES) {
    if ((counts.get(role) ?? 0) !== 1) {
      noteCoreAccessWarning(
        scopeKey,
        source,
        `Core access model violation (${scopeLabel}): each core role must be present exactly once.`,
      );
      return;
    }
  }
}

async function assertCoreAccessModel(source: "startup" | "request", orgId?: string): Promise<void> {
  const scopeKey = orgId ? `org:${orgId}` : "all-orgs";
  const now = Date.now();
  const lastValidationMs = lastCoreAccessValidationMsByScope.get(scopeKey) ?? 0;
  if (now - lastValidationMs < CORE_ACCESS_CHECK_INTERVAL_MS) {
    return;
  }

  if (!isPostgresConfigured()) {
    const rows = Object.values(memoryEmployeeProvisioning);
    if (orgId) {
      const roles = rows.filter((row) => row.orgId === orgId).map((row) => row.role);
      assertExactCoreRolesForScope(source, scopeKey, `org ${orgId}`, roles);
    } else {
      const grouped = new Map<string, string[]>();
      for (const row of rows) {
        grouped.set(row.orgId, [...(grouped.get(row.orgId) ?? []), row.role]);
      }
      for (const [scopedOrgId, roles] of grouped.entries()) {
        assertExactCoreRolesForScope(source, `org:${scopedOrgId}`, `org ${scopedOrgId}`, roles);
      }
    }
    lastCoreAccessValidationMsByScope.set(scopeKey, now);
    return;
  }

  if (orgId) {
    const rows = await querySystem<{ role: string }>(
      `select role::text as role
         from app.employees
        where org_id = $1 and deleted_at_utc is null`,
      [orgId],
    );
    assertExactCoreRolesForScope(
      source,
      scopeKey,
      `org ${orgId}`,
      rows.map((row) => row.role),
    );
    lastCoreAccessValidationMsByScope.set(scopeKey, now);
    return;
  }

  const rows = await querySystem<{ org_id: string; role: string }>(
    `select org_id, role::text as role
       from app.employees
      where deleted_at_utc is null
      order by org_id asc`,
  );

  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    grouped.set(row.org_id, [...(grouped.get(row.org_id) ?? []), row.role]);
  }
  for (const [scopedOrgId, roles] of grouped.entries()) {
    assertExactCoreRolesForScope(source, `org:${scopedOrgId}`, `org ${scopedOrgId}`, roles);
  }
  if (grouped.size === 0) {
    noteCoreAccessWarning("all-orgs", source, "Core access model violation: no active organizations provisioned.");
  }

  lastCoreAccessValidationMsByScope.set(scopeKey, now);
}

function bootCoreAccessModelGuard(): void {
  void assertCoreAccessModel("startup").catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown core access model error";
    if (process.env.NODE_ENV === "production") {
      console.error(`Core access model startup warning: ${message}`);
      return;
    }
    if (!warnedCoreAccessScopes.has("startup")) {
      warnedCoreAccessScopes.add("startup");
      console.warn(message);
    }
  });
}

bootCoreAccessModelGuard();

async function assertSessionNotRevoked(orgId: string, userId: string, jti: string | null, exp: number | null) {
  if (!jti || !exp) {
    return;
  }

  if (!isPostgresConfigured()) {
    if (revokedMemoryTokens.has(`${orgId}:${userId}:${jti}`)) {
      throw unauthorized("Session has been revoked. Please sign in again.");
    }
    return;
  }

  const rows = await querySystem<{ exists: number }>(
    `select 1 as exists
      from app.revoked_sessions
     where org_id = $1 and user_id = $2 and session_jti = $3 and deleted_at_utc is null
     limit 1`,
    [orgId, userId, jti],
  );

  if (rows.length > 0) {
    throw unauthorized("Session has been revoked. Please sign in again.");
  }
}

function getRequestedOrgId(request: Request): string | null {
  const headerValue = request.headers.get("x-org-id")?.trim();
  if (headerValue) {
    return headerValue;
  }
  const url = new URL(request.url);
  const queryValue = url.searchParams.get("orgId")?.trim();
  return queryValue && queryValue.length > 0 ? queryValue : null;
}

function selectMembership(
  memberships: Array<{ orgId: string; role: UserRole }>,
  requestedOrgId: string | null,
): { orgId: string; role: UserRole } {
  if (memberships.length === 0) {
    throw forbidden("User is authenticated but not provisioned in employees table.");
  }

  if (requestedOrgId) {
    const selected = memberships.find((membership) => membership.orgId === requestedOrgId);
    if (!selected) {
      throw forbidden("Requested org is not provisioned for this user.");
    }
    return selected;
  }

  if (memberships.length > 1) {
    throw forbidden("User is provisioned in multiple orgs; set x-org-id header or orgId query parameter.");
  }

  return memberships[0];
}

async function listMembershipsForUser(userId: string): Promise<Array<{ orgId: string; role: UserRole }>> {
  if (!isPostgresConfigured()) {
    const provisioned = memoryEmployeeProvisioning[userId];
    if (!provisioned) {
      return [];
    }
    return [{ orgId: provisioned.orgId, role: provisioned.role }];
  }

  const rows = await querySystem<{ org_id: string; role: string }>(
    `select org_id, role::text as role
       from app.employees
      where user_id = $1 and deleted_at_utc is null
      order by created_at_utc asc`,
    [userId],
  );
  return rows.map((row) => ({ orgId: row.org_id, role: asRole(row.role) }));
}

export async function listProvisionedOrgIdsForUser(userId: string): Promise<string[]> {
  const memberships = await listMembershipsForUser(userId);
  return [...new Set(memberships.map((membership) => membership.orgId))];
}

export async function getSessionUser(
  request: Request,
  options?: { allowCoreAccessViolation?: boolean },
): Promise<SessionUser> {
  assertAuthWiringAtStartup();
  const verified = await verifyWithRefresh(request);
  const userId = verified.payload.sub;

  if (!userId) {
    throw unauthorized("Session is missing user subject.");
  }

  if (!isPostgresConfigured()) {
    const memberships = await listMembershipsForUser(userId);
    const selected = selectMembership(memberships, getRequestedOrgId(request));

    if (!options?.allowCoreAccessViolation) {
      await assertCoreAccessModel("request", selected.orgId);
    }

    await assertSessionNotRevoked(
      selected.orgId,
      userId,
      verified.payload.jti ? String(verified.payload.jti) : null,
      verified.payload.exp ?? null,
    );

    return {
      userId,
      role: selected.role,
      orgId: selected.orgId,
    };
  }

  const memberships = await listMembershipsForUser(userId);
  const employee = selectMembership(memberships, getRequestedOrgId(request));
  if (!options?.allowCoreAccessViolation) {
    await assertCoreAccessModel("request", employee.orgId);
  }
  await assertSessionNotRevoked(
    employee.orgId,
    userId,
    verified.payload.jti ? String(verified.payload.jti) : null,
    verified.payload.exp ?? null,
  );

  return {
    userId,
    role: employee.role,
    orgId: employee.orgId,
  };
}

export async function signOutSession(request: Request): Promise<void> {
  assertAuthWiringAtStartup();
  const verified = await verifyWithRefresh(request);
  const userId = verified.payload.sub;
  if (!userId) {
    throw unauthorized("Session is missing user subject.");
  }

  if (!isPostgresConfigured()) {
    const memberships = await listMembershipsForUser(userId);
    const selected = selectMembership(memberships, getRequestedOrgId(request));
    if (!selected) {
      throw unauthorized("Authenticated user is not provisioned.");
    }
    const jti = verified.payload.jti ? String(verified.payload.jti) : null;
    if (jti) {
      revokedMemoryTokens.add(`${selected.orgId}:${userId}:${jti}`);
    }
    return;
  }

  const memberships = await listMembershipsForUser(userId);
  const selected = selectMembership(memberships, getRequestedOrgId(request));
  const orgId = selected.orgId;
  const jti = verified.payload.jti ? String(verified.payload.jti) : null;
  const exp = verified.payload.exp;
  if (jti && exp) {
    await querySystem(
      `insert into app.revoked_sessions (org_id, session_jti, user_id, expires_at_utc, deleted_at_utc)
       values ($1, $2, $3, to_timestamp($4), null)
       on conflict (org_id, session_jti) do nothing`,
      [orgId, jti, userId, exp],
    );
  }
}

export function __resetAuthCachesForTests(): void {
  lastCoreAccessValidationMsByScope.clear();
  warnedCoreAccessScopes.clear();
  jwksCache.verifier = null;
  jwksCache.fetchedAtMs = 0;
  jwksCache.expiresAtMs = 0;
  jwksCache.inFlightRefresh = null;
  jwksCache.unknownKidUntilMs.clear();
}
