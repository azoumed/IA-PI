import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, catalogs, publications, sources } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, getI18n, pick } from "@/lib/i18n";
import { searchScore } from "@/lib/similarity";
import { importCatalog, reprocessCatalog, saveSource, triggerAgent } from "@/app/actions";
import { RunStatusBadge } from "@/components/badges";
import { Badge, Button, Card, Empty, Field, PageTitle, TableWrap } from "@/components/ui";

const catTone = { pending: "gray", processing: "blue", done: "green", error: "red" } as const;

export default async function WatchPage({ searchParams }: { searchParams: Promise<{ q?: string; catalog?: string; imported?: string; started?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const catalogFilter = sp.catalog ? Number(sp.catalog) : null;

  const [cats, srcs, runs, pubs] = await Promise.all([
    db.select().from(catalogs).orderBy(desc(catalogs.importedAt)).limit(30),
    db.select().from(sources).orderBy(asc(sources.id)),
    db.select().from(agentRuns).orderBy(desc(agentRuns.startedAt)).limit(10),
    db
      .select()
      .from(publications)
      .where(catalogFilter ? eq(publications.catalogId, catalogFilter) : undefined)
      .orderBy(desc(publications.id))
      .limit(q ? 5000 : 100),
  ]);
  const pubList = q
    ? pubs
        .map((p) => ({ p, s: searchScore(q, [p.markName, p.markNameAr, p.applicant, p.applicationNumber]) }))
        .filter((x) => x.s >= 0.7)
        .sort((a, b) => b.s - a.s)
        .slice(0, 100)
        .map((x) => x.p)
    : pubs;
  const running = runs.some((r) => r.status === "running");

  return (
    <>
      <PageTitle
        actions={
          user.role !== "assistant" && (
            <form action={triggerAgent}><Button disabled={running}>{t("dash.runAgent")}</Button></form>
          )
        }
      >
        {t("watch.title")}
      </PageTitle>
      <p className="-mt-3 mb-2 text-sm text-muted">{t("watch.intro")}</p>
      <p className="mb-4 text-xs text-muted">{t("watch.noCaptcha")}</p>
      {sp.imported === "duplicate" && <p className="mb-4 rounded-md bg-warning/15 p-2 text-sm text-warning">{t("watch.duplicate")}</p>}
      {(sp.imported === "1" || sp.started === "1" || running) && (
        <p className="mb-4 rounded-md bg-primary-soft p-2 text-sm text-primary">{t("run.status.running")}… — {t("watch.runs")}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("watch.upload")}>
          <form action={importCatalog} className="grid gap-3">
            <Field label="PDF"><input type="file" name="file" accept="application/pdf" /></Field>
            <Field label={t("watch.uploadUrl")}><input type="url" name="url" dir="ltr" placeholder="https://www.ompic.ma/…/catalogue.pdf" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("watch.issueRef")}><input name="issueRef" dir="ltr" /></Field>
              <Field label={t("watch.publishedAt")}><input type="date" name="publishedAt" /></Field>
            </div>
            <div><Button>{t("watch.import")}</Button></div>
          </form>
        </Card>

        <Card title={t("watch.sources")}>
          <ul className="divide-y divide-border text-sm">
            {srcs.map((s) => (
              <li key={s.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{s.name}</a>
                  {user.role === "admin" ? (
                    <form action={saveSource} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="checkbox" name="enabled" defaultChecked={s.enabled} />
                      <button className="text-xs text-primary hover:underline">{t("common.save")}</button>
                    </form>
                  ) : (
                    <Badge tone={s.enabled ? "green" : "gray"}>{s.enabled ? t("common.yes") : t("common.no")}</Badge>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {s.kind === "catalog_page" ? t("watch.kind.catalog") : t("watch.kind.procedure")} · {t("watch.lastChecked")} : {formatDateTime(locale, s.lastCheckedAt)}
                  {s.lastError && <span className="text-danger"> · {t("watch.lastError")} : {s.lastError}</span>}
                </div>
              </li>
            ))}
          </ul>
          {user.role === "admin" && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-primary">{t("watch.addSource")}</summary>
              <form action={saveSource} className="mt-3 grid gap-2">
                <Field label={t("watch.sourceName")}><input name="name" required /></Field>
                <Field label={t("watch.sourceUrl")}><input name="url" type="url" required dir="ltr" /></Field>
                <select name="kind" defaultValue="catalog_page">
                  <option value="catalog_page">{t("watch.kind.catalogLong")}</option>
                  <option value="procedure_page">{t("watch.kind.procedureLong")}</option>
                </select>
                <div><Button>{t("common.add")}</Button></div>
              </form>
            </details>
          )}
        </Card>
      </div>

      <Card title={t("watch.catalogs")} className="mt-4">
        {cats.length ? (
          <TableWrap>
            <table>
              <thead><tr><th>{t("watch.issueRef")}</th><th>{t("watch.publishedAt")}</th><th>{t("common.status")}</th><th>{t("watch.entries")}</th><th>{t("common.actions")}</th></tr></thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <a href={`/veille?catalog=${c.id}`} className="font-medium text-primary hover:underline">{c.issueRef ?? c.title}</a>
                      {c.sourceUrl && <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="ms-2 text-xs text-muted hover:underline">PDF ↗</a>}
                      <div className="text-xs text-muted">{c.pageCount ? `${c.pageCount} p.` : ""} · {formatDateTime(locale, c.importedAt)}</div>
                    </td>
                    <td>{formatDate(locale, c.publishedAt)}</td>
                    <td>
                      <Badge tone={catTone[c.status]}>{t(`watch.status.${c.status}`)}</Badge>
                      {c.error && <div className="text-xs text-danger">{c.error}</div>}
                    </td>
                    <td>{c.entriesCount}</td>
                    <td>
                      {user.role !== "assistant" && c.status !== "processing" && (
                        <form action={reprocessCatalog}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button variant="ghost">{t("watch.reprocess")}</Button>
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

      <Card title={t("watch.publications")} className="mt-4">
        <form className="mb-3 flex gap-2">
          {catalogFilter && <input type="hidden" name="catalog" value={catalogFilter} />}
          <input name="q" defaultValue={q} placeholder={t("watch.searchPlaceholder")} />
          <button className="rounded-md border border-border px-3 text-sm">{t("common.search")}</button>
        </form>
        {pubList.length ? (
          <TableWrap>
            <table>
              <thead><tr><th>N°</th><th>{t("rights.name")}</th><th>{t("rights.holder")}</th><th>Nice</th><th>{t("rights.publicationDate")}</th><th>{t("rights.catalogPage")}</th></tr></thead>
              <tbody>
                {pubList.map((p) => (
                  <tr key={p.id}>
                    <td dir="ltr">{p.applicationNumber}{p.international && <Badge tone="blue">INT</Badge>}</td>
                    <td className="font-medium">{pick(locale, p.markName, p.markNameAr)}{p.markNameAr && locale === "fr" && <span lang="ar" className="ms-2 text-muted">{p.markNameAr}</span>}</td>
                    <td>{p.applicant}</td>
                    <td>{p.niceClasses.join(", ")}</td>
                    <td>{formatDate(locale, p.publicationDate)}</td>
                    <td>{p.page}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : <Empty>{t("common.none")}</Empty>}
      </Card>

      <Card title={t("watch.runs")} className="mt-4">
        {runs.length ? (
          <ul className="divide-y divide-border text-sm">
            {runs.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <RunStatusBadge status={r.status} t={t} />
                  <span className="text-muted">{formatDateTime(locale, r.startedAt)} · {r.trigger}</span>
                </div>
                <p className="mt-1">{pick(locale, r.summary, r.summaryAr)}</p>
                {r.log.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-primary">{t("watch.log")} ({r.log.length})</summary>
                    <ul className="mt-1 space-y-0.5 font-mono text-xs" dir="ltr">
                      {r.log.map((l, i) => (
                        <li key={i} className={l.level === "error" ? "text-danger" : l.level === "warn" ? "text-warning" : "text-muted"}>
                          {l.at.slice(11, 19)} [{l.level}] {l.msg}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        ) : <Empty>{t("dash.never")}</Empty>}
      </Card>
    </>
  );
}
