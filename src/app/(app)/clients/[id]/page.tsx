import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, rights } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, getI18n, pick } from "@/lib/i18n";
import { deleteClient } from "@/app/actions";
import { ClientForm } from "@/components/client-form";
import { Badge, Button, Card, Empty, LinkButton, PageTitle, TableWrap } from "@/components/ui";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const id = Number((await params).id);
  const client = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!client) notFound();
  const list = await db.select().from(rights).where(eq(rights.clientId, id)).orderBy(asc(rights.name));
  return (
    <>
      <PageTitle actions={<LinkButton href={`/droits/nouveau?client=${id}`}>{t("rights.new")}</LinkButton>}>
        {pick(locale, client.name, client.nameAr)}
      </PageTitle>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title={t("rights.title")} className="lg:col-span-3">
          {list.length ? (
            <TableWrap>
              <table>
                <thead><tr><th>{t("rights.name")}</th><th>{t("rights.type")}</th><th>{t("rights.applicationNumber")}</th><th>{t("rights.niceClasses")}</th><th>{t("rights.expiryDate")}</th></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td><Link className="font-medium text-primary hover:underline" href={`/droits/${r.id}`}>{pick(locale, r.name, r.nameAr)}</Link></td>
                      <td><Badge tone="blue">{t(`rights.type.${r.type}`)}</Badge></td>
                      <td dir="ltr">{r.applicationNumber ?? r.registrationNumber}</td>
                      <td>{r.niceClasses.join(", ")}</td>
                      <td>{formatDate(locale, r.expiryDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : <Empty>{t("common.none")}</Empty>}
        </Card>
        <Card title={t("common.edit")} className="lg:col-span-2">
          <ClientForm client={client} t={t} />
          {user.role !== "assistant" && (
            <form action={deleteClient} className="mt-4 border-t border-border pt-4">
              <input type="hidden" name="id" value={client.id} />
              <Button variant="danger">{t("common.delete")}</Button>
            </form>
          )}
        </Card>
      </div>
      <p className="mt-4"><Link href="/clients" className="text-sm text-primary hover:underline">← {t("common.back")}</Link></p>
    </>
  );
}
