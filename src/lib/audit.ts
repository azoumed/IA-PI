import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export type Actor = { id: number | null; label: string };
export const AGENT_ACTOR: Actor = { id: null, label: "Agent IA" };

export async function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: number | null,
  details?: unknown,
) {
  await db.insert(auditLog).values({
    actorId: actor.id,
    actorLabel: actor.label,
    action,
    entity,
    entityId,
    details: details ?? null,
  });
}
