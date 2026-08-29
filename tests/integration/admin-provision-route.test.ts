import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/admin/provision-user/route";
import { authHeaders, setupFreshState } from "../helpers";

describe("/api/admin/provision-user", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("rejects roles outside owner/hr/cto", async () => {
    const request = new Request("http://localhost/api/admin/provision-user", {
      method: "POST",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({
        userId: "someone-1",
        role: "invalid-role",
        email: "someone@example.com",
        fullName: "Someone",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects provisioning a fourth active account", async () => {
    const request = new Request("http://localhost/api/admin/provision-user", {
      method: "POST",
      headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
      body: JSON.stringify({
        userId: "new-core-user",
        role: "hr",
        email: "new@example.com",
        fullName: "New User",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
  });
});
