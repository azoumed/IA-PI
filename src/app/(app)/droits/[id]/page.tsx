import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts, clients, deadlines, documents, rights, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, getI18n, pick } from "@/lib/i18n";
import { addDocument, createDeadline, deleteRight, markRightVerified } from "@/app/actions";
import { RightForm } from "@/components/right-form";
import { AlertStatusBadge, RemainingBadge, ScoreBadge } from "@/components/badges";
import { Badge, Button, Card, Empty, Field, PageTitle } from "@/components/ui";

export default async function RightPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const id = Number((await params).id);
  const right = await db.query.rights.findFirst({ where: eq(rights.id, id) });
  if (!right) notFound();
  const [client, clientsList, usersList, docs, dls, als] = await Promise.all([
    db.query.clients.findFirst({ where: eq(clients.id, right.clientId) }),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)),
    db.select().from(documents).where(eq(documents.rightId, id)).orderBy(desc(documents.createdAt)),
    db.select().from(deadlines).where(eq(deadlines.rightId, id)).orderBy(asc(deadlines.done), asc(deadlines.dueDate)),
    db.select().from(alerts).where(eq(alerts.rightId, id)).orderBy(desc(alerts.createdAt)).limit(20),
  ]);

  return (
    <>
      <PageTitle
        actions={
          <form action={markRightVerified}>
            <input type="hidden" name="id" value={id} />
            <Button variant="secondary">✓ {t("rights.lastVerified")} : {formatDate(locale, right.lastVerifiedAt)}</Button>
          </form>
        }
      >
        <span className="flex flex-wrap items-center gap-2">
          {right.imageUrl && <img src={right.imageUrl} alt="" className="h-10 w-10 rounded border border-border object-contain" />}
          {pick(locale, right.name, right.nameAr)}
          <Badge tone="blue">{t(`rights.type.${right.type}`)}</Badge>
        </span>
      </PageTitle>
      <p className="-mt-4 mb-6 text-sm text-muted">
        <Link href={`/clients/${right.clientId}`} className="text-primary hover:underline">{pick(locale, client?.name, client?.nameAr)}</Link>
        {" · "}<span dir="ltr">{right.applicationNumber ?? right.registrationNumber}</span> · {right.status}
      </p>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <RightForm right={right} clientsList={clientsList} usersList={usersList} t={t} />
          {user.role !== "assistant" && (
            <form action={deleteRight} className="mt-4 border-t border-border pt-4">
              <input type="hidden" name="id" value={id} />
              <Button variant="danger">{t("common.delete")}</Button>
            </form>
          )}
        </Card>

        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card title={t("rights.alerts")}>
            {als.length ? (
              <ul className="divide-y divide-border text-sm">
                {als.map((a) => (
                  <li key={a.id} className="py-2">
                    <div className="flex items-center gap-2"><AlertStatusBadge status={a.status} t={t} /><ScoreBadge score={a.score} /></div>
                    <Link href={`/alertes?id=${a.id}`} className="mt-1 block hover:underline">{pick(locale, a.whatHappened, a.whatHappenedAr)}</Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>{t("common.none")}</Empty>}
          </Card>

          <Card title={t("rights.deadlines")}>
            {dls.length ? (
              <ul className="divide-y divide-border text-sm">
                {dls.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-2 py-2">
                    <div>
                      <div className={d.done ? "text-muted line-through" : "font-medium"}>{pick(locale, d.label, d.labelAr)}</div>
                      <div className="text-xs text-muted">{t(`deadlines.type.${d.type}`)} · {formatDate(locale, d.dueDate)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <RemainingBadge due={d.dueDate} t={t} done={d.done} />
                      <Badge tone={d.confirmed ? "green" : "orange"}>{d.confirmed ? t("common.confirmed") : t("common.toConfirm")}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty>{t("common.none")}</Empty>}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-primary">{t("deadlines.new")}</summary>
              <form action={createDeadline} className="mt-3 grid gap-2">
                <input type="hidden" name="rightId" value={id} />
                <Field label={t("deadlines.label")}><input name="label" required /></Field>
                <Field label={t("deadlines.type")}>
                  <select name="type" defaultValue="other">
                    {(["opposition", "renewal", "annuity", "response", "other"] as const).map((k) => <option key={k} value={k}>{t(`deadlines.type.${k}`)}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t("deadlines.start")}><input type="date" name="startDate" /></Field>
                  <Field label={t("deadlines.due")}><input type="date" name="dueDate" required /></Field>
                </div>
                <Field label={t("deadlines.basis")}><input name="legalBasis" /></Field>
                <label className="flex items-center gap-2"><input type="checkbox" name="confirmed" /> {t("common.confirmed")}</label>
                <div><Button>{t("common.add")}</Button></div>
              </form>
            </details>
          </Card>

          <Card title={t("rights.documents")}>
            {docs.length ? (
              <ul className="divide-y divide-border text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="py-2">
                    {d.storagePath ? <a className="font-medium text-primary hover:underline" href={`/api/documents/${d.id}`}>{d.title}</a> : <span className="font-medium">{d.title}</span>}
                    <div className="text-xs text-muted">
                      {d.kind} · {formatDate(locale, d.receivedAt)}
                      {d.notificationDate && <> · {t("rights.docNotification")} : {formatDate(locale, d.notificationDate)}</>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty>{t("common.none")}</Empty>}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-primary">{t("rights.addDocument")}</summary>
              <form action={addDocument} className="mt-3 grid gap-2">
                <input type="hidden" name="rightId" value={id} />
                <Field label={t("rights.docTitle")}><input name="title" required /></Field>
                <Field label={t("rights.docKind")}>
                  <select name="kind">
                    {(["notification", "correspondence", "certificate", "client", "other"] as const).map((k) => (
                      <option key={k} value={t(`doc.kind.${k}`)}>{t(`doc.kind.${k}`)}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t("common.date")}><input type="date" name="receivedAt" /></Field>
                  <Field label={t("rights.docNotification")}><input type="date" name="notificationDate" /></Field>
                </div>
                <Field label={t("rights.docFile")}><input type="file" name="file" /></Field>
                <div><Button>{t("common.add")}</Button></div>
              </form>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
