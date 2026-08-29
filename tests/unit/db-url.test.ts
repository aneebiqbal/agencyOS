import { describe, expect, it } from "vitest";

import {
  maskDatabaseUrl,
  validateDatabaseUrl,
} from "../../scripts/lib/db-url.mjs";

describe("validateDatabaseUrl", () => {
  const cases: Array<{
    name: string;
    value: string;
    varName?: string;
    expectedError: string;
  }> = [
    {
      name: "empty string",
      value: "",
      expectedError: "DATABASE_URL is missing or empty.",
    },
    {
      name: "missing scheme / not a URL",
      value: "not-a-connection-string",
      expectedError:
        "DATABASE_URL is not a well-formed URL. Expected a postgres:// or postgresql:// connection string.",
    },
    {
      name: "wrong scheme",
      value: "mysql://postgres:secret@localhost:3306/agency",
      expectedError: "DATABASE_URL must use a postgres:// or postgresql:// scheme (got mysql://).",
    },
    {
      name: "pooler hostname + direct username",
      value:
        "postgresql://postgres:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      expectedError:
        "DATABASE_URL uses a pooler hostname but a direct-connection username format — these need to match. Pooler usernames look like postgres.<project-ref>.",
    },
    {
      name: "direct hostname + pooler username",
      value: "postgresql://postgres.abcdefghijklmnop:secret@db.abcdefghijklmnop.supabase.co:5432/postgres",
      expectedError:
        "DATABASE_URL uses a direct hostname but a pooler username format — these need to match. Direct connections expect username postgres.",
    },
    {
      name: "unedited YOUR-PASSWORD placeholder",
      value: "postgresql://postgres:YOUR-PASSWORD@db.abcdefghijklmnop.supabase.co:5432/postgres",
      expectedError:
        "DATABASE_URL still contains an unedited placeholder value. Replace it with your real connection string.",
    },
    {
      name: "unedited replace-with- placeholder",
      value:
        "postgresql://postgres.replace-with-ref:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      expectedError:
        "DATABASE_URL still contains an unedited placeholder value. Replace it with your real connection string.",
    },
  ];

  for (const testCase of cases) {
    it(`rejects ${testCase.name}`, () => {
      const result = validateDatabaseUrl(testCase.value, testCase.varName ?? "DATABASE_URL");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(testCase.expectedError);
      }
    });
  }

  it("accepts a valid pooler URL", () => {
    const result = validateDatabaseUrl(
      "postgresql://postgres.abcdefghijklmnop:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      "DATABASE_URL",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain("pooler.supabase.com");
      expect(result.summary).toContain("db=postgres");
    }
  });

  it("accepts a valid direct Supabase URL", () => {
    const result = validateDatabaseUrl(
      "postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres",
      "DIRECT_DATABASE_URL",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a local postgres URL without Supabase username rules", () => {
    const result = validateDatabaseUrl("postgresql://postgres:secret@localhost:5432/agency_os_test");
    expect(result.ok).toBe(true);
  });
});

describe("maskDatabaseUrl", () => {
  it("never includes the password", () => {
    const masked = maskDatabaseUrl(
      "postgresql://postgres.abc:super-secret-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    );
    expect(masked).not.toContain("super-secret-password");
    expect(masked).not.toContain("postgres.abc");
    expect(masked).toContain("***:***@");
    expect(masked).toContain("aws-0-us-east-1.pooler.supabase.com");
    expect(masked).toContain(":6543");
    expect(masked).toContain("/postgres");
  });
});
