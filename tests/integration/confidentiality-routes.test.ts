import { beforeEach, describe, expect, it } from "vitest";

import { POST as PUBLISH_NOTICE } from "@/app/api/admin/confidentiality-notice/route";
import { POST as ACKNOWLEDGE } from "@/app/api/confidentiality/acknowledge/route";
import { GET as GET_STATUS } from "@/app/api/confidentiality/status/route";
import { authHeaders, readJson, setupFreshState } from "../helpers";

describe("confidentiality routes", () => {
  beforeEach(async () => {
    await setupFreshState();
  });

  it("returns confidentiality status for authenticated actor", async () => {
    const response = await GET_STATUS(
      new Request("http://localhost/api/confidentiality/status", {
        headers: await authHeaders("owner", "owner-1"),
      }),
    );
    const body = await readJson(response);
    const data = body.data as { noticeVersion: string };
    expect(response.status).toBe(200);
    expect(data.noticeVersion.length).toBeGreaterThan(0);
  });

  it("rejects unauthorized status request", async () => {
    const response = await GET_STATUS(new Request("http://localhost/api/confidentiality/status"));
    expect(response.status).toBe(401);
  });

  it("acknowledges confidentiality with valid payload", async () => {
    const statusResponse = await GET_STATUS(
      new Request("http://localhost/api/confidentiality/status", {
        headers: await authHeaders("owner", "owner-1"),
      }),
    );
    const statusBody = await readJson(statusResponse);
    const statusData = statusBody.data as { noticeVersion: string };

    const response = await ACKNOWLEDGE(
      new Request("http://localhost/api/confidentiality/acknowledge", {
        method: "POST",
        headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
        body: JSON.stringify({ version: statusData.noticeVersion, acknowledged: true }),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("rejects invalid acknowledge payload", async () => {
    const response = await ACKNOWLEDGE(
      new Request("http://localhost/api/confidentiality/acknowledge", {
        method: "POST",
        headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
        body: JSON.stringify({ version: "v1", acknowledged: false }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("publishes notice as owner", async () => {
    const response = await PUBLISH_NOTICE(
      new Request("http://localhost/api/admin/confidentiality-notice", {
        method: "POST",
        headers: await authHeaders("owner", "owner-1", { "content-type": "application/json" }),
        body: JSON.stringify({
          version: "v-next",
          noticeText: "This is a pilot confidentiality notice that has more than twenty characters.",
        }),
      }),
    );
    expect(response.status).toBe(201);
  });

  it("rejects publishing notice as non-owner", async () => {
    const response = await PUBLISH_NOTICE(
      new Request("http://localhost/api/admin/confidentiality-notice", {
        method: "POST",
        headers: await authHeaders("hr", "hr-1", { "content-type": "application/json" }),
        body: JSON.stringify({
          version: "v-next",
          noticeText: "This is a pilot confidentiality notice that has more than twenty characters.",
        }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
