import { describe, expect, it } from "vitest";

import { assertValidLeadTransition } from "@/lib/domain/lead";

describe("lead transition guard", () => {
  it("allows legal transitions", () => {
    expect(() => assertValidLeadTransition("new", "qualified")).not.toThrow();
    expect(() => assertValidLeadTransition("proposal", "won")).not.toThrow();
  });

  it("blocks illegal transitions", () => {
    expect(() => assertValidLeadTransition("new", "won")).toThrow("Invalid lead stage transition");
    expect(() => assertValidLeadTransition("lost", "proposal")).toThrow(
      "Invalid lead stage transition",
    );
  });
});
