import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime, getI18n } from "@/lib/i18n";
import { Badge, Card, Empty, PageTitle, TableWrap } from "@/components/ui";

export default async function JournalPage() {
  await requireUser(["admin", "avocat"]);
  const { t, locale } = await getI18n();
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(300);
  return (
    <>
      <PageTitle>{t("journal.title")}</PageTitle>
      <Card>
        {rows.length ? (
          <TableWrap>
            <table>
              <thead><tr><th>{t("journal.at")}</th><th>{t("journal.actor")}</th><th>{t("journal.action")}</th><th>{t("journal.entity")}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDateTime(locale, r.at)}</td>
                    <td>{r.actorId == null ? <Badge tone="blue">{r.actorLabel}</Badge> : r.actorLabel}</td>
                    <td>{r.action}</td>
                    <td>
                      {r.entity}{r.entityId != null && ` #${r.entityId}`}
                      {r.details != null && (
                        <details>
                          <summary className="cursor-pointer text-xs text-primary">…</summary>
                          <pre className="max-w-xl overflow-x-auto text-xs" dir="ltr">{JSON.stringify(r.details, null, 2)}</pre>
                        </details>
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
