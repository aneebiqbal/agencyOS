const PLACEHOLDER_PATTERNS = [
  /YOUR-PASSWORD/i,
  /replace-with-/i,
  /your[_-]?password/i,
  /<password>/i,
  /PASSWORD_HERE/i,
  /\bchangeme\b/i,
];

/**
 * Mask credentials in a connection string for safe logging.
 * Never includes password or username plaintext.
 */
export function maskDatabaseUrl(value) {
  if (value == null || String(value).trim() === "") {
    return "(empty)";
  }

  try {
    const parsed = new URL(String(value).trim());
    const protocol = parsed.protocol.replace(/:$/, "");
    const host = parsed.hostname || "(no-host)";
    const port = parsed.port ? `:${parsed.port}` : "";
    const database = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    const auth = parsed.username || parsed.password ? "***:***@" : "";
    return `${protocol}://${auth}${host}${port}${database}`;
  } catch {
    return "(unparseable connection string — credentials redacted)";
  }
}

function isPoolerHostname(hostname) {
  return /(^|\.)pooler\.supabase\.com$/i.test(hostname);
}

function isDirectSupabaseHostname(hostname) {
  return /^db\.[a-z0-9]+\.supabase\.co$/i.test(hostname);
}

function isPoolerUsername(username) {
  return /^postgres\.[a-z0-9]+$/i.test(username);
}

function isDirectUsername(username) {
  return /^postgres$/i.test(username);
}

/**
 * Structurally validate a Postgres connection string for Agency OS / Supabase use.
 * Does not open a network connection.
 *
 * @param {string | undefined | null} value
 * @param {string} varName
 * @returns {{ ok: true, summary: string } | { ok: false, error: string }}
 */
export function validateDatabaseUrl(value, varName = "DATABASE_URL") {
  if (value == null || String(value).trim() === "") {
    return { ok: false, error: `${varName} is missing or empty.` };
  }

  const trimmed = String(value).trim();

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        error: `${varName} still contains an unedited placeholder value. Replace it with your real connection string.`,
      };
    }
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: `${varName} is not a well-formed URL. Expected a postgres:// or postgresql:// connection string.`,
    };
  }

  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "postgres" && scheme !== "postgresql") {
    return {
      ok: false,
      error: `${varName} must use a postgres:// or postgresql:// scheme (got ${scheme}://).`,
    };
  }

  const hostname = parsed.hostname;
  const username = decodeURIComponent(parsed.username || "");

  if (isPoolerHostname(hostname) && username && !isPoolerUsername(username)) {
    return {
      ok: false,
      error: `${varName} uses a pooler hostname but a direct-connection username format — these need to match. Pooler usernames look like postgres.<project-ref>.`,
    };
  }

  if (isDirectSupabaseHostname(hostname) && username && !isDirectUsername(username)) {
    return {
      ok: false,
      error: `${varName} uses a direct hostname but a pooler username format — these need to match. Direct connections expect username postgres.`,
    };
  }

  const port = parsed.port || (scheme === "postgres" || scheme === "postgresql" ? "5432" : "");
  const database = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname.replace(/^\//, "") : "(default)";
  const hostLabel = hostname || "(unix-socket/local)";

  return {
    ok: true,
    summary: `host=${hostLabel} port=${port || "(default)"} db=${database}`,
  };
}

/**
 * Resolve and validate a required connection env var. Exits process messaging on failure
 * is left to the caller — this only returns validated string or throws Error with a clear message.
 *
 * @param {string | undefined} value
 * @param {string} varName
 * @returns {string}
 */
export function requireValidDatabaseUrl(value, varName) {
  if (value == null || String(value).trim() === "") {
    throw new Error(
      `${varName} is missing. Set it in .env.local (loaded automatically) or the environment, then retry.`,
    );
  }

  const result = validateDatabaseUrl(value, varName);
  if (!result.ok) {
    throw new Error(result.error);
  }

  return String(value).trim();
}
