import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, rights } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, getI18n, pick } from "@/lib/i18n";
import { searchScore } from "@/lib/similarity";
import { Badge, Card, Empty, LinkButton, PageTitle, TableWrap } from "@/components/ui";

export default async function RightsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  await requireUser();
  const { t, locale } = await getI18n();
  const { q = "", type = "" } = await searchParams;
  const rows = await db
    .select({ r: rights, clientName: clients.name, clientNameAr: clients.nameAr })
    .from(rights)
    .innerJoin(clients, eq(clients.id, rights.clientId))
    .where(type === "marque" || type === "brevet" || type === "dessin" ? eq(rights.type, type) : undefined)
    .orderBy(asc(rights.name));
  const list = q
    ? rows
        .map((x) => ({ ...x, s: searchScore(q, [x.r.name, x.r.nameAr, x.r.holder, x.r.holderAr, x.r.applicationNumber, x.r.registrationNumber, x.clientName]) }))
        .filter((x) => x.s >= 0.72)
        .sort((a, b) => b.s - a.s)
    : rows;

  return (
    <>
      <PageTitle actions={<LinkButton href="/droits/nouveau">{t("rights.new")}</LinkButton>}>{t("rights.title")}</PageTitle>
      <Card>
        <form className="mb-3 flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder={t("watch.searchPlaceholder")} className="min-w-60 flex-1" />
          <select name="type" defaultValue={type} className="w-auto">
            <option value="">{t("rights.filter.all")}</option>
            <option value="marque">{t("rights.type.marque")}</option>
            <option value="brevet">{t("rights.type.brevet")}</option>
            <option value="dessin">{t("rights.type.dessin")}</option>
          </select>
          <button className="rounded-md border border-border px-3 text-sm">{t("common.search")}</button>
        </form>
        {list.length ? (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t("rights.name")}</th><th>{t("rights.client")}</th><th>{t("rights.type")}</th>
                  <th>{t("rights.applicationNumber")}</th><th>{t("rights.niceClasses")}</th><th>{t("rights.status")}</th><th>{t("rights.expiryDate")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ r, clientName, clientNameAr }) => (
                  <tr key={r.id}>
                    <td>
                      <Link className="font-medium text-primary hover:underline" href={`/droits/${r.id}`}>{pick(locale, r.name, r.nameAr)}</Link>
                      {r.watch && r.type === "marque" && <span className="ms-1 text-xs text-muted">◉</span>}
                    </td>
                    <td>{pick(locale, clientName, clientNameAr)}</td>
                    <td><Badge tone="blue">{t(`rights.type.${r.type}`)}</Badge></td>
                    <td dir="ltr">{r.applicationNumber ?? r.registrationNumber ?? "—"}</td>
                    <td>{r.niceClasses.join(", ")}</td>
                    <td>{r.status}</td>
                    <td>{formatDate(locale, r.expiryDate)}</td>
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
