import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { isAgentRunning, runAgent } from "@/lib/agent/run";

/**
 * Déclenchement planifié de l'agent (cron, toutes les heures ou chaque jour) :
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine/api/agent/run
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (await isAgentRunning()) return Response.json({ started: false, reason: "already_running" }, { status: 409 });
  after(() => runAgent("schedule"));
  return Response.json({ started: true }, { status: 202 });
}
