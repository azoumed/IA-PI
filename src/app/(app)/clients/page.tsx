import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, rights } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { searchScore } from "@/lib/similarity";
import { Card, Empty, LinkButton, PageTitle, TableWrap } from "@/components/ui";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { t } = await getI18n();
  const { q = "" } = await searchParams;
  const rows = await db
    .select({ c: clients, n: count(rights.id) })
    .from(clients)
    .leftJoin(rights, eq(rights.clientId, clients.id))
    .groupBy(clients.id)
    .orderBy(asc(clients.name));
  const list = q ? rows.filter((r) => searchScore(q, [r.c.name, r.c.nameAr, r.c.rcNumber]) >= 0.72) : rows;
  return (
    <>
      <PageTitle actions={<LinkButton href="/clients/nouveau">{t("clients.new")}</LinkButton>}>{t("clients.title")}</PageTitle>
      <Card>
        <form className="mb-3 flex gap-2">
          <input name="q" defaultValue={q} placeholder={t("common.search")} />
          <button className="rounded-md border border-border px-3 text-sm">{t("common.search")}</button>
        </form>
        {list.length ? (
          <TableWrap>
            <table>
              <thead><tr><th>{t("clients.name")}</th><th>{t("clients.nameAr")}</th><th>{t("clients.rc")}</th><th>{t("clients.rightsCount")}</th></tr></thead>
              <tbody>
                {list.map(({ c, n }) => (
                  <tr key={c.id}>
                    <td><Link className="font-medium text-primary hover:underline" href={`/clients/${c.id}`}>{c.name}</Link></td>
                    <td dir="rtl" lang="ar">{c.nameAr}</td>
                    <td dir="ltr">{c.rcNumber}</td>
                    <td>{n}</td>
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
