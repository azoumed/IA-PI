import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, deadlines, rights } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, getI18n, pick } from "@/lib/i18n";
import { updateDeadline } from "@/app/actions";
import { RemainingBadge } from "@/components/badges";
import { Badge, Button, Card, Empty, PageTitle, TableWrap } from "@/components/ui";

export default async function DeadlinesPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const showDone = (await searchParams).all === "1";
  const rows = await db
    .select({ d: deadlines, r: rights, c: clients })
    .from(deadlines)
    .innerJoin(rights, eq(rights.id, deadlines.rightId))
    .innerJoin(clients, eq(clients.id, rights.clientId))
    .where(showDone ? undefined : eq(deadlines.done, false))
    .orderBy(asc(deadlines.done), asc(deadlines.dueDate));
  const canEdit = user.role !== "assistant";

  return (
    <>
      <PageTitle actions={<Link href={showDone ? "/delais" : "/delais?all=1"} className="text-sm text-primary hover:underline">{t("deadlines.showDone")}</Link>}>
        {t("deadlines.title")}
      </PageTitle>
      <p className="mb-4 text-sm text-muted">{t("deadlines.notice")}</p>
      <Card>
        {rows.length ? (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t("deadlines.due")}</th><th>{t("deadlines.remaining")}</th><th>{t("deadlines.label")}</th>
                  <th>{t("rights.client")}</th><th>{t("deadlines.type")}</th><th>{t("deadlines.basis")}</th><th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ d, r, c }) => (
                  <tr key={d.id} className={d.done ? "opacity-60" : ""}>
                    <td className="whitespace-nowrap font-medium">{formatDate(locale, d.dueDate)}</td>
                    <td className="whitespace-nowrap">
                      <RemainingBadge due={d.dueDate} t={t} done={d.done} />{" "}
                      <Badge tone={d.confirmed ? "green" : "orange"}>{d.confirmed ? t("common.confirmed") : t("common.toConfirm")}</Badge>
                    </td>
                    <td>
                      <Link href={`/droits/${r.id}`} className="text-primary hover:underline">{pick(locale, d.label, d.labelAr)}</Link>
                      {d.alertId && <Link href={`/alertes?id=${d.alertId}`} className="ms-2 text-xs text-muted hover:underline">↗</Link>}
                      <div className="text-xs text-muted">{t("deadlines.start")} : {formatDate(locale, d.startDate)}</div>
                    </td>
                    <td>{pick(locale, c.name, c.nameAr)}</td>
                    <td>{t(`deadlines.type.${d.type}`)}</td>
                    <td className="max-w-xs text-xs text-muted">{pick(locale, d.legalBasis, d.legalBasisAr) || "—"}</td>
                    <td>
                      {canEdit && (
                        <form action={updateDeadline} className="flex flex-wrap gap-1">
                          <input type="hidden" name="id" value={d.id} />
                          {!d.confirmed && !d.done && <Button name="op" value="confirm" variant="secondary">{t("deadlines.confirm")}</Button>}
                          {!d.done ? <Button name="op" value="done" variant="secondary">{t("deadlines.markDone")}</Button> : <Button name="op" value="reopen" variant="ghost">{t("alerts.reopen")}</Button>}
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : <Empty>{t("common.none")}</Empty>}
      </Card>
    </>
  );
}
