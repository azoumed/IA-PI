"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { alerts, clients, deadlines, documents, rights, sources, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { actorOf, createSession, destroySession, requireUser } from "@/lib/auth";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { registerCatalog, runAgent } from "@/lib/agent/run";
import { downloadPdf } from "@/lib/agent/collect";
import { saveFile } from "@/lib/storage";

// ---------- utilitaires de formulaire ----------
const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const req = (f: FormData, k: string) => {
  const v = str(f, k);
  if (!v) throw new Error(`Champ obligatoire : ${k}`);
  return v;
};
const dateOrNull = (f: FormData, k: string) => {
  const v = str(f, k);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};
const intOrNull = (f: FormData, k: string) => {
  const v = str(f, k);
  return v && /^\d+$/.test(v) ? Number(v) : null;
};
const classes = (f: FormData, k: string) =>
  [...new Set((str(f, k) ?? "").split(/[^\d]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 45))].sort((a, b) => a - b);

// ---------- authentification et langue ----------
export async function login(_: unknown, form: FormData) {
  const email = (str(form, "email") ?? "").toLowerCase();
  const password = str(form, "password") ?? "";
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) return { error: true, email };
  await createSession(user.id);
  (await cookies()).set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 365 * 24 * 3600 });
  await audit(actorOf(user), "login", "user", user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function switchLocale(form: FormData) {
  const locale = str(form, "locale") === "ar" ? "ar" : "fr";
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 24 * 3600 });
  const user = await requireUser();
  await db.update(users).set({ locale }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
}

// ---------- clients ----------
export async function saveClient(form: FormData) {
  const user = await requireUser(["admin", "avocat", "assistant"]);
  const id = intOrNull(form, "id");
  const values = {
    name: req(form, "name"),
    nameAr: str(form, "nameAr"),
    email: str(form, "email"),
    phone: str(form, "phone"),
    rcNumber: str(form, "rcNumber"),
    notes: str(form, "notes"),
  };
  let clientId = id;
  if (id) {
    await db.update(clients).set(values).where(eq(clients.id, id));
    await audit(actorOf(user), "update", "client", id, values);
  } else {
    const [c] = await db.insert(clients).values(values).returning();
    clientId = c.id;
    await audit(actorOf(user), "create", "client", c.id, values);
  }
  redirect(`/clients/${clientId}`);
}

export async function deleteClient(form: FormData) {
  const user = await requireUser(["admin", "avocat"]);
  const id = Number(req(form, "id"));
  await db.delete(clients).where(eq(clients.id, id));
  await audit(actorOf(user), "delete", "client", id);
  redirect("/clients");
}

// ---------- droits ----------
export async function saveRight(form: FormData) {
  const user = await requireUser(["admin", "avocat", "assistant"]);
  const id = intOrNull(form, "id");
  const type = str(form, "type");
  const values = {
    clientId: Number(req(form, "clientId")),
    type: (type === "brevet" || type === "dessin" ? type : "marque") as "marque" | "brevet" | "dessin",
    holder: req(form, "holder"),
    holderAr: str(form, "holderAr"),
    applicationNumber: str(form, "applicationNumber"),
    registrationNumber: str(form, "registrationNumber"),
    name: req(form, "name"),
    nameAr: str(form, "nameAr"),
    imageUrl: str(form, "imageUrl"),
    country: str(form, "country") ?? "MA",
    goodsServices: str(form, "goodsServices"),
    niceClasses: classes(form, "niceClasses"),
    filingDate: dateOrNull(form, "filingDate"),
    priorityDate: dateOrNull(form, "priorityDate"),
    publicationDate: dateOrNull(form, "publicationDate"),
    registrationDate: dateOrNull(form, "registrationDate"),
    expiryDate: dateOrNull(form, "expiryDate"),
    status: str(form, "status") ?? "déposée",
    nextAction: str(form, "nextAction"),
    responsibleId: intOrNull(form, "responsibleId"),
    notes: str(form, "notes"),
    watch: form.get("watch") === "on",
    sourceUrl: str(form, "sourceUrl"),
    catalogRef: str(form, "catalogRef"),
    catalogPage: intOrNull(form, "catalogPage"),
    lastVerifiedAt: dateOrNull(form, "lastVerifiedAt"),
    updatedAt: new Date(),
  };
  let rightId = id;
  if (id) {
    await db.update(rights).set(values).where(eq(rights.id, id));
    await audit(actorOf(user), "update", "right", id, values);
  } else {
    const [r] = await db.insert(rights).values(values).returning();
    rightId = r.id;
    await audit(actorOf(user), "create", "right", r.id, values);
  }
  redirect(`/droits/${rightId}`);
}

export async function deleteRight(form: FormData) {
  const user = await requireUser(["admin", "avocat"]);
  const id = Number(req(form, "id"));
  const r = await db.query.rights.findFirst({ where: eq(rights.id, id) });
  await db.delete(rights).where(eq(rights.id, id));
  await audit(actorOf(user), "delete", "right", id, { name: r?.name });
  redirect(r ? `/clients/${r.clientId}` : "/droits");
}

export async function addDocument(form: FormData) {
  const user = await requireUser();
  const rightId = Number(req(form, "rightId"));
  const file = form.get("file");
  let storagePath: string | null = null;
  let fileName: string | null = null;
  if (file instanceof File && file.size > 0) {
    fileName = file.name;
    storagePath = await saveFile(`droits/${rightId}`, file.name, new Uint8Array(await file.arrayBuffer()));
  }
  const [d] = await db
    .insert(documents)
    .values({
      rightId,
      title: req(form, "title"),
      kind: str(form, "kind") ?? "correspondance",
      receivedAt: dateOrNull(form, "receivedAt"),
      notificationDate: dateOrNull(form, "notificationDate"),
      fileName,
      storagePath,
    })
    .returning();
  await audit(actorOf(user), "create", "document", d.id, { rightId, title: d.title });
  revalidatePath(`/droits/${rightId}`);
}

// ---------- alertes (validation humaine) ----------
export async function reviewAlert(form: FormData) {
  const user = await requireUser(["admin", "avocat"]);
  const id = Number(req(form, "id"));
  const decision = req(form, "decision") as "validated" | "dismissed" | "done" | "new";
  if (!["validated", "dismissed", "done", "new"].includes(decision)) throw new Error("Décision invalide");
  const note = str(form, "note");
  await db
    .update(alerts)
    .set({ status: decision, reviewNote: note, reviewedById: user.id, reviewedAt: new Date() })
    .where(eq(alerts.id, id));
  // Une alerte écartée clôt le délai proposé ; une alerte validée le maintient « à confirmer ».
  if (decision === "dismissed") await db.update(deadlines).set({ done: true, notes: "Alerte écartée" }).where(eq(deadlines.alertId, id));
  if (decision === "new") await db.update(deadlines).set({ done: false }).where(eq(deadlines.alertId, id));
  await audit(actorOf(user), `alert:${decision}`, "alert", id, { note });
  revalidatePath("/alertes");
  revalidatePath("/");
}

// ---------- délais ----------
export async function updateDeadline(form: FormData) {
  const user = await requireUser(["admin", "avocat"]);
  const id = Number(req(form, "id"));
  const op = req(form, "op");
  const patch =
    op === "confirm" ? { confirmed: true } : op === "unconfirm" ? { confirmed: false } : op === "done" ? { done: true } : op === "reopen" ? { done: false } : null;
  if (!patch) throw new Error("Opération invalide");
  await db.update(deadlines).set(patch).where(eq(deadlines.id, id));
  await audit(actorOf(user), `deadline:${op}`, "deadline", id);
  revalidatePath("/delais");
  revalidatePath("/");
}

export async function createDeadline(form: FormData) {
  const user = await requireUser(["admin", "avocat", "assistant"]);
  const type = (str(form, "type") ?? "other") as "opposition" | "renewal" | "annuity" | "response" | "other";
  const [d] = await db
    .insert(deadlines)
    .values({
      rightId: Number(req(form, "rightId")),
      type,
      label: req(form, "label"),
      startDate: dateOrNull(form, "startDate"),
      dueDate: dateOrNull(form, "dueDate") ?? req(form, "dueDate"),
      legalBasis: str(form, "legalBasis"),
      confirmed: form.get("confirmed") === "on",
      notes: str(form, "notes"),
    })
    .returning();
  await audit(actorOf(user), "create", "deadline", d.id, { label: d.label, due: d.dueDate });
  revalidatePath("/delais");
  revalidatePath(`/droits/${d.rightId}`);
}

// ---------- veille et agent ----------
export async function importCatalog(form: FormData) {
  const user = await requireUser(["admin", "avocat", "assistant"]);
  const file = form.get("file");
  const url = str(form, "url");
  let data: Uint8Array;
  let fileName: string;
  if (file instanceof File && file.size > 0) {
    data = new Uint8Array(await file.arrayBuffer());
    fileName = file.name;
    if (String.fromCharCode(...data.slice(0, 4)) !== "%PDF") throw new Error("Le fichier n'est pas un PDF");
  } else if (url) {
    data = await downloadPdf(url);
    fileName = url.split("/").pop() ?? "catalogue.pdf";
  } else {
    throw new Error("Choisissez un fichier PDF ou indiquez une URL");
  }
  const id = await registerCatalog({
    title: str(form, "title") ?? fileName,
    sourceUrl: url,
    data,
    fileName,
    issueRef: str(form, "issueRef"),
    publishedAt: dateOrNull(form, "publishedAt"),
  });
  if (id) {
    await audit(actorOf(user), "import", "catalog", id, { fileName });
    after(() => runAgent("upload", { catalogIds: [id] }));
  }
  revalidatePath("/veille");
  redirect("/veille?imported=" + (id ? "1" : "duplicate"));
}

export async function reprocessCatalog(form: FormData) {
  const user = await requireUser(["admin", "avocat"]);
  const id = Number(req(form, "id"));
  await audit(actorOf(user), "reprocess", "catalog", id);
  after(() => runAgent("upload", { catalogIds: [id] }));
  redirect("/veille?started=1");
}

export async function triggerAgent() {
  const user = await requireUser(["admin", "avocat"]);
  await audit(actorOf(user), "run", "agent", null);
  after(() => runAgent("manual"));
  redirect("/veille?started=1");
}

export async function saveSource(form: FormData) {
  const user = await requireUser(["admin"]);
  const id = intOrNull(form, "id");
  if (id) {
    const enabled = form.get("enabled") === "on";
    await db.update(sources).set({ enabled }).where(eq(sources.id, id));
    await audit(actorOf(user), "update", "source", id, { enabled });
  } else {
    const url = req(form, "url");
    new URL(url);
    const [s] = await db
      .insert(sources)
      .values({ name: req(form, "name"), url, kind: str(form, "kind") === "procedure_page" ? "procedure_page" : "catalog_page" })
      .onConflictDoNothing()
      .returning();
    if (s) await audit(actorOf(user), "create", "source", s.id, { url });
  }
  revalidatePath("/veille");
}

// ---------- utilisateurs ----------
export async function saveUser(form: FormData) {
  const admin = await requireUser(["admin"]);
  const id = intOrNull(form, "id");
  const role = (["admin", "avocat", "assistant"].includes(str(form, "role") ?? "") ? str(form, "role") : "avocat") as
    | "admin"
    | "avocat"
    | "assistant";
  const locale = str(form, "locale") === "ar" ? "ar" : "fr";
  const password = str(form, "password");
  if (id) {
    const patch: Partial<typeof users.$inferInsert> = { role, locale, active: form.get("active") === "on", name: req(form, "name") };
    if (password) {
      if (password.length < 10) throw new Error("Mot de passe trop court (10 caractères minimum)");
      patch.passwordHash = await bcrypt.hash(password, 12);
    }
    if (id === admin.id) patch.active = true;
    await db.update(users).set(patch).where(eq(users.id, id));
    await audit(actorOf(admin), "update", "user", id, { role, active: patch.active, passwordChanged: !!password });
  } else {
    if (!password || password.length < 10) throw new Error("Mot de passe trop court (10 caractères minimum)");
    const [u] = await db
      .insert(users)
      .values({ email: req(form, "email").toLowerCase(), name: req(form, "name"), role, locale, passwordHash: await bcrypt.hash(password, 12) })
      .returning();
    await audit(actorOf(admin), "create", "user", u.id, { email: u.email, role });
  }
  revalidatePath("/utilisateurs");
}

export async function markRightVerified(form: FormData) {
  const user = await requireUser();
  const id = Number(req(form, "id"));
  const today = new Date().toISOString().slice(0, 10);
  await db.update(rights).set({ lastVerifiedAt: today, updatedAt: new Date() }).where(and(eq(rights.id, id)));
  await audit(actorOf(user), "verify", "right", id, { lastVerifiedAt: today });
  revalidatePath(`/droits/${id}`);
}
