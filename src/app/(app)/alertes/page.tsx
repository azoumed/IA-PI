import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts, catalogs, clients, publications, rights, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, getI18n, pick } from "@/lib/i18n";
import { reviewAlert } from "@/app/actions";
import { AlertStatusBadge, RemainingBadge, ScoreBadge } from "@/components/badges";
import { Badge, Button, Card, Empty, PageTitle } from "@/components/ui";

const STATUSES = ["new", "validated", "done", "dismissed"] as const;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ status?: string; id?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : sp.id ? null : "new";

  const rows = await db
    .select({ a: alerts, r: rights, c: clients, p: publications, cat: catalogs, reviewer: users.name })
    .from(alerts)
    .leftJoin(rights, eq(rights.id, alerts.rightId))
    .leftJoin(clients, eq(clients.id, rights.clientId))
    .leftJoin(publications, eq(publications.id, alerts.publicationId))
    .leftJoin(catalogs, eq(catalogs.id, publications.catalogId))
    .leftJoin(users, eq(users.id, alerts.reviewedById))
    .where(sp.id ? eq(alerts.id, Number(sp.id)) : status ? eq(alerts.status, status) : undefined)
    .orderBy(desc(alerts.score), desc(alerts.createdAt))
    .limit(100);

  const canReview = user.role !== "assistant";

  return (
    <>
      <PageTitle>{t("alerts.title")}</PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link key={s} href={`/alertes?status=${s}`} className={`rounded-full border px-3 py-1 text-sm ${status === s ? "border-primary bg-primary-soft text-primary" : "border-border"}`}>
            {t(`alerts.status.${s}`)}
          </Link>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">{t("alerts.disclaimer")}</p>

      {rows.length === 0 && <Card><Empty>{t("common.none")}</Empty></Card>}
      <div className="flex flex-col gap-4">
        {rows.map(({ a, r, c, p, cat, reviewer }) => {
          const ai = (a.scoreDetails as { ai?: { riskLevel?: string } | null } | null)?.ai;
          return (
            <Card key={a.id}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <AlertStatusBadge status={a.status} t={t} />
                <ScoreBadge score={a.score} />
                {ai?.riskLevel && <Badge tone={ai.riskLevel === "élevé" ? "red" : ai.riskLevel === "moyen" ? "orange" : "gray"}>IA : {ai.riskLevel}</Badge>}
                {a.createdByAgent && <span className="text-xs text-muted">{t("alerts.agent")} · {formatDateTime(locale, a.createdAt)}</span>}
              </div>

              <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-[12rem_1fr]">
                <dt className="font-semibold text-muted">{t("alerts.what")}</dt>
                <dd>{pick(locale, a.whatHappened, a.whatHappenedAr)}</dd>

                <dt className="font-semibold text-muted">{t("alerts.which")}</dt>
                <dd>
                  {r ? (
                    <Link href={`/droits/${r.id}`} className="text-primary hover:underline">
                      {pick(locale, c?.name, c?.nameAr)} — {pick(locale, r.name, r.nameAr)} (<span dir="ltr">{r.applicationNumber ?? r.registrationNumber ?? "—"}</span>)
                    </Link>
                  ) : "—"}
                </dd>

                <dt className="font-semibold text-muted">{t("alerts.why")}</dt>
                <dd>{pick(locale, a.why, a.whyAr)}</dd>

                <dt className="font-semibold text-muted">{t("alerts.action")}</dt>
                <dd>{pick(locale, a.suggestedAction, a.suggestedActionAr)}</dd>

                <dt className="font-semibold text-muted">{t("alerts.deadline")}</dt>
                <dd>
                  {a.dueDate ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{t("deadlines.start")} : {formatDate(locale, a.startDate)}</span>
                      <span>→ {t("deadlines.due")} : <strong>{formatDate(locale, a.dueDate)}</strong></span>
                      <RemainingBadge due={a.dueDate} t={t} />
                      <Badge tone="orange">{t("common.toConfirm")}</Badge>
                    </div>
                  ) : "—"}
                  {a.legalBasis && <div className="mt-1 text-xs text-muted">{pick(locale, a.legalBasis, a.legalBasisAr)}</div>}
                  {(a.sourceUrl || cat) && (
                    <div className="mt-1 text-xs">
                      {a.sourceUrl ? <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{t("common.source")}</a> : t("common.source")}
                      {cat && <> · {cat.issueRef ?? cat.title}{p?.page ? `, p. ${p.page}` : ""}</>}
                    </div>
                  )}
                </dd>
              </dl>

              {p && r && (
                <div className="mt-4 grid gap-3 rounded-md bg-background p-3 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-muted">{t("alerts.clientMark")}</div>
                    <div className="text-lg font-bold">{r.name} {r.nameAr && <span lang="ar">· {r.nameAr}</span>}</div>
                    <div className="text-xs text-muted">Nice : {r.niceClasses.join(", ") || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted">{t("alerts.publishedMark")} {locale === "ar" ? "رقم" : "n°"} <span dir="ltr">{p.applicationNumber}</span></div>
                    <div className="text-lg font-bold">{p.markName} {p.markNameAr && <span lang="ar">· {p.markNameAr}</span>}</div>
                    <div className="text-xs text-muted">Nice : {p.niceClasses.join(", ") || "—"} · {p.applicant}</div>
                    {p.goodsServices && <div className="mt-1 line-clamp-3 text-xs">{p.goodsServices}</div>}
                  </div>
                </div>
              )}

              {a.reviewedAt && (
                <p className="mt-3 text-xs text-muted">
                  {reviewer} · {formatDateTime(locale, a.reviewedAt)}{a.reviewNote && <> — « {a.reviewNote} »</>}
                </p>
              )}

              {canReview && (
                <form action={reviewAlert} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                  <input type="hidden" name="id" value={a.id} />
                  <input name="note" placeholder={t("alerts.reviewNote")} className="min-w-48 flex-1" defaultValue={a.reviewNote ?? ""} />
                  {a.status !== "validated" && <Button name="decision" value="validated">{t("alerts.validate")}</Button>}
                  {a.status !== "done" && <Button name="decision" value="done" variant="secondary">{t("alerts.done")}</Button>}
                  {a.status !== "dismissed" && <Button name="decision" value="dismissed" variant="secondary">{t("alerts.dismiss")}</Button>}
                  {a.status !== "new" && <Button name="decision" value="new" variant="ghost">{t("alerts.reopen")}</Button>}
                </form>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
