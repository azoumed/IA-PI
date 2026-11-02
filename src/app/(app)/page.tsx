import Link from "next/link";
import { and, asc, count, desc, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, alerts, clients, deadlines, rights, sources } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, getI18n, pick } from "@/lib/i18n";
import { activeReminder, addMonths, daysUntil, todayISO } from "@/lib/deadlines";
import { triggerAgent } from "@/app/actions";
import { Badge, Button, Card, Empty, PageTitle, Stat } from "@/components/ui";
import { RemainingBadge, RunStatusBadge } from "@/components/badges";

export default async function Dashboard() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const in30 = addMonths(todayISO(), 1);

  const [[newAlerts], [rightsCount], [clientsCount], upcoming, lastRun, failed, lastSuccess] = await Promise.all([
    db.select({ n: count() }).from(alerts).where(eq(alerts.status, "new")),
    db.select({ n: count() }).from(rights),
    db.select({ n: count() }).from(clients),
    db
      .select({ d: deadlines, rightName: rights.name, rightNameAr: rights.nameAr, clientName: clients.name, clientNameAr: clients.nameAr })
      .from(deadlines)
      .innerJoin(rights, eq(rights.id, deadlines.rightId))
      .innerJoin(clients, eq(clients.id, rights.clientId))
      .where(and(eq(deadlines.done, false), lte(deadlines.dueDate, in30)))
      .orderBy(asc(deadlines.dueDate))
      .limit(15),
    db.query.agentRuns.findFirst({ orderBy: desc(agentRuns.startedAt) }),
    db.select().from(sources).where(and(eq(sources.enabled, true), isNotNull(sources.lastError))),
    db.query.agentRuns.findFirst({ where: eq(agentRuns.status, "success"), orderBy: desc(agentRuns.finishedAt) }),
  ]);

  const reminders = upcoming.filter((u) => activeReminder(u.d.dueDate) !== null || daysUntil(u.d.dueDate) < 0);

  return (
    <>
      <PageTitle
        actions={
          user.role !== "assistant" && (
            <form action={triggerAgent}>
              <Button>{t("dash.runAgent")}</Button>
            </form>
          )
        }
      >
        {t("dash.title")}
      </PageTitle>

      <p className="-mt-4 mb-6 text-sm text-muted">
        {t("dash.lastUpdate")} : <strong>{lastSuccess?.finishedAt ? formatDateTime(locale, lastSuccess.finishedAt) : t("dash.never")}</strong>
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("dash.newAlerts")} value={newAlerts.n} href="/alertes" tone={newAlerts.n ? "red" : undefined} />
        <Stat label={t("dash.upcoming")} value={upcoming.length} href="/delais" tone={upcoming.length ? "orange" : undefined} />
        <Stat label={t("dash.rights")} value={rightsCount.n} href="/droits" />
        <Stat label={t("dash.clients")} value={clientsCount.n} href="/clients" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("dash.reminders")}>
          {reminders.length ? (
            <ul className="divide-y divide-border">
              {reminders.map(({ d, rightName, rightNameAr, clientName, clientNameAr }) => (
                <li key={d.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div>
                    <Link href={`/droits/${d.rightId}`} className="font-medium hover:underline">
                      {pick(locale, d.label, d.labelAr)}
                    </Link>
                    <div className="text-muted">
                      {pick(locale, clientName, clientNameAr)} · {pick(locale, rightName, rightNameAr)} · {formatDate(locale, d.dueDate)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <RemainingBadge due={d.dueDate} t={t} />
                    {!d.confirmed && <Badge tone="orange">{t("common.toConfirm")}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t("common.none")}</Empty>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title={t("dash.lastRun")}>
            {lastRun ? (
              <div className="text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <RunStatusBadge status={lastRun.status} t={t} />
                  <span className="text-muted">{formatDateTime(locale, lastRun.startedAt)}</span>
                </div>
                <p>{pick(locale, lastRun.summary, lastRun.summaryAr) || "—"}</p>
              </div>
            ) : (
              <Empty>{t("dash.never")}</Empty>
            )}
          </Card>
          <Card title={t("dash.failedSources")}>
            {failed.length ? (
              <ul className="text-sm">
                {failed.map((s) => (
                  <li key={s.id} className="py-1">
                    <span className="font-medium">{s.name}</span> — <span className="text-danger">{s.lastError}</span>
                    <div className="text-xs text-muted">{formatDateTime(locale, s.lastCheckedAt)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-success">{t("dash.allSourcesOk")}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
