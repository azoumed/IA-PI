import { asc, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alerts, clients, deadlines, rights } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n";
import { askAssistant, hasApiKey } from "@/lib/agent/claude";
import { todayISO } from "@/lib/deadlines";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(40),
});

async function snapshot() {
  const [cl, rs, dls, als] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, nameAr: clients.nameAr }).from(clients).orderBy(asc(clients.id)),
    db.select().from(rights).orderBy(asc(rights.id)),
    db.select().from(deadlines).where(eq(deadlines.done, false)).orderBy(asc(deadlines.dueDate)).limit(300),
    db.select().from(alerts).where(ne(alerts.status, "dismissed")).orderBy(desc(alerts.createdAt)).limit(150),
  ]);
  return JSON.stringify({
    clients: cl,
    rights: rs.map((r) => ({
      id: r.id, clientId: r.clientId, type: r.type, name: r.name, nameAr: r.nameAr, holder: r.holder,
      applicationNumber: r.applicationNumber, registrationNumber: r.registrationNumber, niceClasses: r.niceClasses,
      status: r.status, filingDate: r.filingDate, registrationDate: r.registrationDate, expiryDate: r.expiryDate,
      nextAction: r.nextAction, lastVerifiedAt: r.lastVerifiedAt,
    })),
    openDeadlines: dls.map((d) => ({ rightId: d.rightId, type: d.type, label: d.label, startDate: d.startDate, dueDate: d.dueDate, confirmed: d.confirmed, legalBasis: d.legalBasis })),
    alerts: als.map((a) => ({ rightId: a.rightId, type: a.type, status: a.status, what: a.whatHappened, why: a.why, dueDate: a.dueDate, score: a.score })),
  });
}

export async function POST(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!hasApiKey()) return Response.json({ error: "no_api_key" }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const locale = await getLocale();
  try {
    const history = parsed.data.messages;
    // La date du jour est donnée dans la question (et non dans le prompt système) pour préserver le cache.
    const last = history[history.length - 1];
    const withDate = [...history.slice(0, -1), { ...last, content: `[Date du jour : ${todayISO()}]\n${last.content}` }];
    const answer = await askAssistant(withDate, await snapshot(), locale);
    return Response.json({ answer });
  } catch (e) {
    console.error("assistant", e);
    return Response.json({ error: "upstream" }, { status: 502 });
  }
}
