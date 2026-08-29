import { forbidden } from "@/lib/domain/errors";
import {
  getLatestConfidentialityNotice,
  hasAcknowledgedConfidentiality,
} from "@/lib/persistence";
import type { SessionUser } from "@/lib/domain/types";

export async function assertConfidentialityAcknowledged(actor: SessionUser): Promise<void> {
  const latest = await getLatestConfidentialityNotice(actor);
  if (!latest) {
    throw forbidden("Confidentiality notice is not configured.");
  }

  const acknowledged = await hasAcknowledgedConfidentiality(actor, latest.version);
  if (!acknowledged) {
    throw forbidden("Confidentiality notice must be acknowledged before accessing data.");
  }
}
