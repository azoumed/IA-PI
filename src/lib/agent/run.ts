import "server-only";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db } from "@/db";
import { agentRuns, alerts, catalogs, clients, deadlines, publications, rights, sources, type Publication } from "@/db/schema";
import { audit, AGENT_ACTOR } from "@/lib/audit";
import { OPPOSITION_RULE, RENEWAL_RULE, addMonths, oppositionDeadline, todayISO } from "@/lib/deadlines";
import { scoreMatch } from "@/lib/similarity";
import { readStored, saveFile, sha256 } from "@/lib/storage";
import { downloadPdf, fetchPage, findPdfLinks } from "./collect";
import { extractCatalogChunk, hasApiKey, reviewCandidates, summarizeRun, type ReviewCandidate } from "./claude";

const PAGES_PER_CHUNK = 10;
const MAX_NEW_CATALOGS_PER_RUN = 3;
const STALE_RUN_MINUTES = 60;

type Level = "info" | "warn" | "error";

class RunContext {
  log: { at: string; level: Level; msg: string }[] = [];
  stats: Record<string, number> = {};
  errors = 0;
  constructor(public runId: number) {}
  add(level: Level, msg: string) {
    this.log.push({ at: new Date().toISOString(), level, msg });
    if (level === "error") this.errors++;
  }
  inc(key: string, n = 1) {
    this.stats[key] = (this.stats[key] ?? 0) + n;
  }
  async flush() {
    await db.update(agentRuns).set({ log: this.log, stats: this.stats }).where(eq(agentRuns.id, this.runId));
  }
}

export async function isAgentRunning() {
  const cutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60_000);
  const r = await db.query.agentRuns.findFirst({
    where: and(eq(agentRuns.status, "running"), gte(agentRuns.startedAt, cutoff)),
  });
  return !!r;
}

/**
 * Cycle de mise à jour de l'agent (cahier des charges §9) :
 * déclenchement → collecte → extraction → rapprochement → mise à jour → (validation humaine) → rapport.
 */
export async function runAgent(trigger: "schedule" | "manual" | "upload", opts: { catalogIds?: number[] } = {}) {
  if (await isAgentRunning()) return { started: false as const, reason: "already_running" };
  const [run] = await db.insert(agentRuns).values({ trigger }).returning();
  const ctx = new RunContext(run.id);
  ctx.add("info", `Déclenchement : ${trigger}`);
  if (!hasApiKey()) ctx.add("warn", "ANTHROPIC_API_KEY absente : extraction des PDF et analyses IA désactivées.");

  try {
    // 1. Collecte
    const discovered = trigger === "upload" ? [] : await collectSources(ctx);
    const toProcess = [...new Set([...(opts.catalogIds ?? []), ...discovered])];
    if (trigger !== "upload") {
      const pending = await db.select({ id: catalogs.id }).from(catalogs).where(eq(catalogs.status, "pending"));
      for (const p of pending) if (!toProcess.includes(p.id)) toProcess.push(p.id);
    }
    await ctx.flush();

    // 2. Extraction
    for (const id of toProcess) {
      await processCatalog(id, ctx);
      await ctx.flush();
    }

    // 3-4. Rapprochement et mise à jour (publications des catalogues traités)
    const processed = toProcess.length
      ? await db.select({ id: catalogs.id }).from(catalogs).where(and(inArray(catalogs.id, toProcess), eq(catalogs.status, "done")))
      : [];
    if (processed.length) await matchPublications(processed.map((c) => c.id), ctx);
    await renewalDeadlines(ctx);
    await ctx.flush();

    // 5. Rapport
    const status = ctx.errors === 0 ? "success" : Object.keys(ctx.stats).length ? "partial" : "error";
    let { fr: summary, ar: summaryAr } = buildPlainSummary(ctx);
    if (hasApiKey()) {
      try {
        const s = await summarizeRun({ stats: ctx.stats, log: ctx.log.filter((l) => l.level !== "info").slice(-20) });
        if (s) {
          summary = s.fr;
          summaryAr = s.ar;
        }
      } catch (e) {
        ctx.add("warn", `Résumé IA indisponible : ${errMsg(e)}`);
      }
    }
    await db
      .update(agentRuns)
      .set({ status, finishedAt: new Date(), summary, summaryAr, log: ctx.log, stats: ctx.stats })
      .where(eq(agentRuns.id, run.id));
    return { started: true as const, runId: run.id, status };
  } catch (e) {
    ctx.add("error", `Arrêt inattendu : ${errMsg(e)}`);
    await db
      .update(agentRuns)
      .set({ status: "error", finishedAt: new Date(), summary: "Le passage de l'agent a échoué.", log: ctx.log, stats: ctx.stats })
      .where(eq(agentRuns.id, run.id));
    return { started: true as const, runId: run.id, status: "error" as const };
  }
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function buildPlainSummary(ctx: RunContext) {
  const s = ctx.stats;
  const n = (k: string) => s[k] ?? 0;
  return {
    fr: [
      `Sources contrôlées : ${n("sourcesChecked")} (échecs : ${n("sourcesFailed")}).`,
      `Nouveaux catalogues : ${n("catalogsDiscovered")} ; catalogues analysés : ${n("catalogsProcessed")}.`,
      `Demandes extraites : ${n("publicationsExtracted")} ; alertes de similarité : ${n("similarityAlerts")} ; échéances de renouvellement : ${n("renewalDeadlines")}.`,
    ].join(" "),
    ar: [
      `المصادر المفحوصة: ${n("sourcesChecked")} (تعذر جلب: ${n("sourcesFailed")}).`,
      `فهارس جديدة: ${n("catalogsDiscovered")}؛ فهارس محللة: ${n("catalogsProcessed")}.`,
      `طلبات مستخرجة: ${n("publicationsExtracted")}؛ تنبيهات تشابه: ${n("similarityAlerts")}؛ آجال تجديد: ${n("renewalDeadlines")}.`,
    ].join(" "),
  };
}

// ---------------------------------------------------------------------------

async function collectSources(ctx: RunContext) {
  const newCatalogIds: number[] = [];
  const list = await db.select().from(sources).where(eq(sources.enabled, true));
  for (const src of list) {
    ctx.inc("sourcesChecked");
    const res = await fetchPage(src.url);
    if (!res.ok) {
      ctx.inc("sourcesFailed");
      ctx.add("error", `Source « ${src.name} » injoignable : ${res.error}`);
      await db.update(sources).set({ lastCheckedAt: new Date(), lastError: res.error }).where(eq(sources.id, src.id));
      continue;
    }
    const changed = src.lastHash && src.lastHash !== res.hash;
    await db
      .update(sources)
      .set({ lastCheckedAt: new Date(), lastSuccessAt: new Date(), lastError: null, lastHash: res.hash })
      .where(eq(sources.id, src.id));

    if (src.kind === "procedure_page") {
      if (changed) {
        const [a] = await db
          .insert(alerts)
          .values({
            type: "procedural",
            whatHappened: `La page « ${src.name} » de l'OMPIC a été modifiée.`,
            whatHappenedAr: `تم تعديل صفحة «${src.name}» على موقع OMPIC.`,
            why: "Changement détecté sur une page procédurale surveillée (formulaires, tarifs, services, textes).",
            whyAr: "تم رصد تغيير في صفحة إجرائية مراقبة (النماذج، التعريفات، الخدمات، النصوص).",
            suggestedAction: "Vérifier la nouveauté et mettre à jour les pratiques de dépôt et de suivi.",
            suggestedActionAr: "التحقق من المستجد وتحديث طريقة إعداد الطلبات ومتابعتها.",
            sourceUrl: src.url,
            startDate: todayISO(),
          })
          .returning();
        await audit(AGENT_ACTOR, "create", "alert", a.id, { procedural: src.url });
        ctx.inc("proceduralAlerts");
      }
      continue;
    }

    const links = findPdfLinks(res.body, src.url);
    const known = links.length
      ? await db.select({ url: catalogs.sourceUrl }).from(catalogs).where(inArray(catalogs.sourceUrl, links.map((l) => l.url)))
      : [];
    const knownSet = new Set(known.map((k) => k.url));
    const fresh = links.filter((l) => !knownSet.has(l.url)).slice(0, MAX_NEW_CATALOGS_PER_RUN);
    ctx.add("info", `« ${src.name} » : ${links.length} PDF listés, ${fresh.length} nouveau(x).`);
    for (const link of fresh) {
      try {
        const data = await downloadPdf(link.url);
        const id = await registerCatalog({ title: link.label, sourceUrl: link.url, data, fileName: link.url.split("/").pop() ?? "catalogue.pdf" });
        if (id) {
          newCatalogIds.push(id);
          ctx.inc("catalogsDiscovered");
        }
      } catch (e) {
        ctx.add("error", `Téléchargement de « ${link.label} » impossible : ${errMsg(e)}`);
      }
    }
  }
  return newCatalogIds;
}

/** Enregistre un catalogue (dédoublonné par empreinte SHA-256). Renvoie null s'il existe déjà. */
export async function registerCatalog(input: {
  title: string;
  sourceUrl?: string | null;
  data: Uint8Array;
  fileName: string;
  issueRef?: string | null;
  publishedAt?: string | null;
}) {
  const hash = sha256(input.data);
  const existing = await db.query.catalogs.findFirst({ where: eq(catalogs.contentHash, hash) });
  if (existing) return null;
  const storagePath = await saveFile("catalogues", input.fileName, input.data);
  let pageCount: number | null = null;
  try {
    pageCount = (await PDFDocument.load(input.data, { ignoreEncryption: true })).getPageCount();
  } catch {
    /* PDF illisible : l'erreur sera signalée à l'analyse */
  }
  const [c] = await db
    .insert(catalogs)
    .values({
      title: input.title,
      sourceUrl: input.sourceUrl ?? null,
      fileName: input.fileName,
      storagePath,
      contentHash: hash,
      issueRef: input.issueRef ?? null,
      publishedAt: input.publishedAt ?? null,
      pageCount,
    })
    .returning();
  await audit(AGENT_ACTOR, "import", "catalog", c.id, { title: c.title, sourceUrl: c.sourceUrl });
  return c.id;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoOrNull = (s: string | null | undefined) => (s && ISO_RE.test(s) ? s : null);

export async function processCatalog(catalogId: number, ctx: RunContext) {
  const cat = await db.query.catalogs.findFirst({ where: eq(catalogs.id, catalogId) });
  if (!cat || !cat.storagePath) return;
  if (!hasApiKey()) {
    ctx.add("warn", `Catalogue « ${cat.title} » laissé en attente (pas de clé API).`);
    return;
  }
  await db.update(catalogs).set({ status: "processing", error: null }).where(eq(catalogs.id, cat.id));
  try {
    const src = await PDFDocument.load(await readStored(cat.storagePath), { ignoreEncryption: true });
    const total = src.getPageCount();
    let inserted = 0;
    let issueRef = cat.issueRef;
    let publishedAt = cat.publishedAt;
    let chunkErrors = 0;

    for (let start = 0; start < total; start += PAGES_PER_CHUNK) {
      const end = Math.min(start + PAGES_PER_CHUNK, total);
      const part = await PDFDocument.create();
      const pages = await part.copyPages(src, Array.from({ length: end - start }, (_, i) => start + i));
      pages.forEach((p) => part.addPage(p));
      const b64 = Buffer.from(await part.save()).toString("base64");
      try {
        const ex = await extractCatalogChunk(b64, start + 1, end);
        issueRef ??= ex.catalogIssueRef;
        publishedAt ??= isoOrNull(ex.catalogPublicationDate);
        if (ex.entries.length) {
          const rows = ex.entries
            .filter((e) => e.applicationNumber.trim() && e.markName.trim())
            .map((e) => ({
              catalogId: cat.id,
              applicationNumber: e.applicationNumber.trim(),
              markName: e.markName.trim(),
              markNameAr: e.markNameAr?.trim() || null,
              applicant: e.applicant,
              applicantAddress: e.applicantAddress,
              representative: e.representative,
              niceClasses: [...new Set(e.niceClasses.filter((n) => n >= 1 && n <= 45))],
              goodsServices: e.goodsServices,
              filingDate: isoOrNull(e.filingDate),
              international: e.international,
              page: e.page ?? start + 1,
            }));
          const res = await db.insert(publications).values(rows).onConflictDoNothing().returning({ id: publications.id });
          inserted += res.length;
        }
      } catch (e) {
        chunkErrors++;
        ctx.add("error", `« ${cat.title} » pages ${start + 1}-${end} : ${errMsg(e)}`);
      }
    }

    if (publishedAt) {
      await db
        .update(publications)
        .set({ publicationDate: publishedAt })
        .where(and(eq(publications.catalogId, cat.id), sql`${publications.publicationDate} is null`));
    }
    const failedAll = chunkErrors > 0 && inserted === 0;
    await db
      .update(catalogs)
      .set({
        status: failedAll ? "error" : "done",
        error: chunkErrors ? `${chunkErrors} extrait(s) en échec` : null,
        entriesCount: sql`(select count(*) from publications where catalog_id = ${cat.id})`,
        issueRef,
        publishedAt,
        pageCount: total,
        processedAt: new Date(),
      })
      .where(eq(catalogs.id, cat.id));
    ctx.inc("catalogsProcessed");
    ctx.inc("publicationsExtracted", inserted);
    ctx.add("info", `« ${cat.title} » : ${inserted} demande(s) extraite(s) sur ${total} pages.`);
    if (!publishedAt) ctx.add("warn", `« ${cat.title} » : date de publication inconnue, délais d'opposition non calculés.`);
  } catch (e) {
    await db.update(catalogs).set({ status: "error", error: errMsg(e) }).where(eq(catalogs.id, cat.id));
    ctx.add("error", `Analyse de « ${cat.title} » impossible : ${errMsg(e)}`);
  }
}

async function matchPublications(catalogIds: number[], ctx: RunContext) {
  const watched = await db
    .select({ right: rights, clientName: clients.name })
    .from(rights)
    .innerJoin(clients, eq(clients.id, rights.clientId))
    .where(and(eq(rights.watch, true), eq(rights.type, "marque")));
  if (!watched.length) return;
  const pubs = await db.select().from(publications).where(inArray(publications.catalogId, catalogIds));
  const catalogsById = new Map(
    (await db.select().from(catalogs).where(inArray(catalogs.id, catalogIds))).map((c) => [c.id, c]),
  );

  type Cand = { pub: Publication; w: (typeof watched)[number]; m: ReturnType<typeof scoreMatch> };
  const cands: Cand[] = [];
  for (const pub of pubs) {
    for (const w of watched) {
      const own =
        (w.right.applicationNumber && w.right.applicationNumber === pub.applicationNumber) ||
        (w.right.registrationNumber && w.right.registrationNumber === pub.applicationNumber);
      if (own) continue;
      const m = scoreMatch(w.right, pub);
      if (m.flagged) cands.push({ pub, w, m });
    }
  }
  ctx.add("info", `${pubs.length} demande(s) comparée(s) à ${watched.length} marque(s) : ${cands.length} rapprochement(s).`);

  // Analyse IA par lots
  const reviews = new Map<string, Awaited<ReturnType<typeof reviewCandidates>>[number]>();
  if (hasApiKey()) {
    for (let i = 0; i < cands.length; i += 15) {
      const batch: ReviewCandidate[] = cands.slice(i, i + 15).map((c) => ({
        candidateId: `${c.w.right.id}:${c.pub.id}`,
        client: c.w.clientName,
        clientMark: { name: c.w.right.name, nameAr: c.w.right.nameAr, classes: c.w.right.niceClasses, goodsServices: c.w.right.goodsServices },
        published: {
          number: c.pub.applicationNumber,
          name: c.pub.markName,
          nameAr: c.pub.markNameAr,
          applicant: c.pub.applicant,
          classes: c.pub.niceClasses,
          goodsServices: c.pub.goodsServices,
        },
        automaticScore: c.m.total,
        signals: describeSignals(c.m),
      }));
      try {
        for (const r of await reviewCandidates(batch)) reviews.set(r.candidateId, r);
      } catch (e) {
        ctx.add("warn", `Analyse IA des rapprochements indisponible : ${errMsg(e)}`);
      }
    }
  }

  for (const c of cands) {
    const cat = catalogsById.get(c.pub.catalogId);
    const rv = reviews.get(`${c.w.right.id}:${c.pub.id}`);
    const pubDate = c.pub.publicationDate ?? cat?.publishedAt ?? null;
    const dl = pubDate ? oppositionDeadline(pubDate) : null;
    const signals = describeSignals(c.m);
    const where = `Catalogue ${cat?.issueRef ?? cat?.title ?? ""}${c.pub.page ? `, page ${c.pub.page}` : ""}`;
    const [alert] = await db
      .insert(alerts)
      .values({
        type: "similarity",
        rightId: c.w.right.id,
        publicationId: c.pub.id,
        whatHappened: `Publication de la demande n° ${c.pub.applicationNumber} « ${c.pub.markName} »${c.pub.applicant ? ` (déposant : ${c.pub.applicant})` : ""}, potentiellement similaire à la marque « ${c.w.right.name} » de ${c.w.clientName}. ${where}.`,
        whatHappenedAr: `نُشر طلب العلامة رقم ${c.pub.applicationNumber} «${c.pub.markNameAr || c.pub.markName}» الذي يحتمل تشابهه مع علامة «${c.w.right.nameAr || c.w.right.name}» للموكل ${c.w.clientName}.`,
        why: rv?.whyFr ?? signals.join(" ; "),
        whyAr: rv?.whyAr ?? describeSignals(c.m, "ar").join("؛ "),
        suggestedAction: rv?.actionFr ?? "Étudier l'opportunité d'une opposition et vérifier le statut de la demande.",
        suggestedActionAr: rv?.actionAr ?? "دراسة إمكانية التعرض والتحقق من وضعية الطلب.",
        startDate: dl?.start ?? null,
        dueDate: dl?.due ?? null,
        legalBasis: OPPOSITION_RULE.legalBasis,
        legalBasisAr: OPPOSITION_RULE.legalBasisAr,
        sourceUrl: cat?.sourceUrl ?? null,
        score: c.m.total,
        scoreDetails: { ...c.m, signals, ai: rv ? { relevant: rv.relevant, riskLevel: rv.riskLevel } : null },
      })
      .onConflictDoNothing()
      .returning();
    if (!alert) continue;
    ctx.inc("similarityAlerts");
    await audit(AGENT_ACTOR, "create", "alert", alert.id, { right: c.w.right.id, publication: c.pub.id, score: c.m.total });
    if (dl) {
      const [d] = await db
        .insert(deadlines)
        .values({
          rightId: c.w.right.id,
          alertId: alert.id,
          type: "opposition",
          label: `Opposition éventuelle contre la demande n° ${c.pub.applicationNumber} « ${c.pub.markName} »`,
          labelAr: `تعرض محتمل ضد الطلب رقم ${c.pub.applicationNumber}`,
          startDate: dl.start,
          dueDate: dl.due,
          legalBasis: OPPOSITION_RULE.legalBasis,
          legalBasisAr: OPPOSITION_RULE.legalBasisAr,
          sourceUrl: cat?.sourceUrl ?? null,
        })
        .returning();
      await audit(AGENT_ACTOR, "create", "deadline", d.id, { due: d.dueDate, confirmed: false });
    }
  }
}

function describeSignals(m: ReturnType<typeof scoreMatch>, lang: "fr" | "ar" = "fr") {
  const pct = (x: number) => Math.round(x * 100);
  const L = lang === "fr"
    ? { visual: "ressemblance orthographique", phon: "prononciation proche", skel: "mêmes consonnes (variantes de translittération)", incl: "une dénomination inclut l'autre", ar: "graphie arabe proche", common: "classes de Nice communes", related: "classes de Nice voisines", unknown: "classes non renseignées", total: "score global" }
    : { visual: "تشابه في الكتابة", phon: "تقارب في النطق", skel: "نفس الحروف الساكنة (اختلاف في النقل الحرفي)", incl: "إحدى التسميتين تتضمن الأخرى", ar: "تقارب في الكتابة العربية", common: "أصناف نيس مشتركة", related: "أصناف نيس متقاربة", unknown: "الأصناف غير محددة", total: "الدرجة الإجمالية" };
  const s: string[] = [];
  if (m.name.visual >= 0.75) s.push(`${L.visual} (${pct(m.name.visual)} %)`);
  if (m.name.phonetic >= 0.8) s.push(`${L.phon} (${pct(m.name.phonetic)} %)`);
  if (m.name.skeleton >= 0.85) s.push(L.skel);
  if (m.name.containment) s.push(L.incl);
  if (m.name.arabic >= 0.75) s.push(`${L.ar} (${pct(m.name.arabic)} %)`);
  if (m.classes.common.length) s.push(`${L.common} : ${m.classes.common.join(", ")}`);
  else if (m.classes.related) s.push(L.related);
  else if (m.classes.unknown) s.push(L.unknown);
  return s.length ? s : [`${L.total} ${pct(m.total)} %`];
}

/** Crée les échéances de renouvellement dans les 12 mois, sans doublon. */
async function renewalDeadlines(ctx: RunContext) {
  const horizon = addMonths(todayISO(), 12);
  const due = await db
    .select()
    .from(rights)
    .where(and(isNotNull(rights.expiryDate), lte(rights.expiryDate, horizon), gte(rights.expiryDate, addMonths(todayISO(), -6))));
  for (const r of due) {
    const exists = await db.query.deadlines.findFirst({
      where: and(eq(deadlines.rightId, r.id), eq(deadlines.type, "renewal"), eq(deadlines.dueDate, r.expiryDate!)),
    });
    if (exists) continue;
    const [d] = await db
      .insert(deadlines)
      .values({
        rightId: r.id,
        type: "renewal",
        label: `Renouvellement de « ${r.name} »`,
        labelAr: `تجديد «${r.nameAr || r.name}»`,
        startDate: r.filingDate,
        dueDate: r.expiryDate!,
        legalBasis: r.type === "marque" ? RENEWAL_RULE.legalBasis : null,
        legalBasisAr: r.type === "marque" ? RENEWAL_RULE.legalBasisAr : null,
      })
      .returning();
    await audit(AGENT_ACTOR, "create", "deadline", d.id, { renewal: r.id });
    ctx.inc("renewalDeadlines");
  }
}

export { RunContext };
