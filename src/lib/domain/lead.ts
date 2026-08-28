import { conflict } from "@/lib/domain/errors";
import type { LeadStage } from "@/lib/domain/types";

const allowedTransitions: Record<LeadStage, LeadStage[]> = {
  new: ["qualified", "lost"],
  qualified: ["proposal", "lost"],
  proposal: ["won", "lost"],
  won: [],
  lost: [],
};

export function assertValidLeadTransition(from: LeadStage, to: LeadStage): void {
  if (!allowedTransitions[from].includes(to)) {
    throw conflict(`Invalid lead stage transition: ${from} -> ${to}.`);
  }
}
