import { beforeEach, describe, expect, it } from "vitest";

import { POST as winDeal } from "@/app/api/deals/[dealId]/win/route";
import { queryAsActor, querySystem, isPostgresConfigured } from "@/lib/db/postgres";
import { setupFreshState, authHeaders } from "../helpers";

const describeIfPostgres = isPostgresConfigured() ? describe : describe.skip;

describeIfPostgres("postgres security controls", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("enforces RLS by blocking cross-org project visibility", async () => {
    const rows = await queryAsActor(
      { userId: "employee-1", role: "employee", orgId: "org-test-1" },
      "select id from app.projects where id = 'project-test-2'",
    );
    expect(rows).toHaveLength(0);
  });

  it("keeps audit log immutable for normal app role", async () => {
    await queryAsActor(
      { userId: "owner-1", role: "owner", orgId: "org-test-1" },
      `insert into app.audit_log_entries
       (org_id, id, actor_user_id, action, entity, entity_id, before_json, after_json, timestamp_utc, deleted_at_utc)
       values ('org-test-1', 'audit-test-1', 'owner-1', 'test', 'entity', 'entity-1', null, null, now(), null)`,
    );

    await expect(
      queryAsActor(
        { userId: "owner-1", role: "owner", orgId: "org-test-1" },
        "update app.audit_log_entries set action = 'tamper' where id = 'audit-test-1'",
      ),
    ).rejects.toThrow();
  });

  it("rolls back won-deal transaction when mid-step failure occurs", async () => {
    const response = await winDeal(
      new Request("http://localhost/api/deals/deal-test-1/win", {
        method: "POST",
        headers: authHeaders("owner", "owner-1", { "content-type": "application/json" }),
        body: JSON.stringify({ clientName: "__force_tx_fail__", managerUserId: "manager-1" }),
      }),
      { params: Promise.resolve({ dealId: "deal-test-1" }) },
    );
    expect(response.status).toBe(400);

    const projectRows = await querySystem<{ count: string }>(
      "select count(*)::text as count from app.projects where org_id = 'org-test-1' and id != 'project-test-1'",
    );
    expect(Number(projectRows[0].count)).toBe(0);

    const dealRows = await querySystem<{ stage: string }>(
      "select stage::text as stage from app.deals where org_id = 'org-test-1' and id = 'deal-test-1'",
    );
    expect(dealRows[0].stage).toBe("open");
  });
});
