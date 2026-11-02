import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "avocat", "assistant"]);
export const localeEnum = pgEnum("locale", ["fr", "ar"]);
export const rightTypeEnum = pgEnum("right_type", ["marque", "brevet", "dessin"]);
export const catalogStatusEnum = pgEnum("catalog_status", ["pending", "processing", "done", "error"]);
export const alertTypeEnum = pgEnum("alert_type", ["similarity", "deadline", "procedural", "status"]);
export const alertStatusEnum = pgEnum("alert_status", ["new", "validated", "dismissed", "done"]);
export const deadlineTypeEnum = pgEnum("deadline_type", ["opposition", "renewal", "annuity", "response", "other"]);
export const runStatusEnum = pgEnum("run_status", ["running", "success", "partial", "error"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("avocat"),
  locale: localeEnum("locale").notNull().default("fr"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  email: text("email"),
  phone: text("phone"),
  rcNumber: text("rc_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fiche indépendante pour chaque droit d'un client (cahier des charges §3). */
export const rights = pgTable("rights", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  // Identification
  type: rightTypeEnum("type").notNull().default("marque"),
  holder: text("holder").notNull(),
  holderAr: text("holder_ar"),
  applicationNumber: text("application_number"),
  registrationNumber: text("registration_number"),
  // Étendue de la protection
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  imageUrl: text("image_url"),
  country: text("country").notNull().default("MA"),
  goodsServices: text("goods_services"),
  niceClasses: integer("nice_classes").array().notNull().default([]),
  // Dates
  filingDate: date("filing_date"),
  priorityDate: date("priority_date"),
  publicationDate: date("publication_date"),
  registrationDate: date("registration_date"),
  expiryDate: date("expiry_date"),
  // Suivi
  status: text("status").notNull().default("déposée"),
  nextAction: text("next_action"),
  responsibleId: integer("responsible_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  watch: boolean("watch").notNull().default(true),
  // Preuve
  sourceUrl: text("source_url"),
  catalogRef: text("catalog_ref"),
  catalogPage: integer("catalog_page"),
  lastVerifiedAt: date("last_verified_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Correspondances et pièces (notifications de l'Office, courriers, documents du client). */
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  rightId: integer("right_id").notNull().references(() => rights.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("correspondance"),
  title: text("title").notNull(),
  fileName: text("file_name"),
  storagePath: text("storage_path"),
  receivedAt: date("received_at"),
  notificationDate: date("notification_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sources surveillées par l'agent (pages OMPIC listant les catalogues, pages procédurales). */
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  kind: text("kind").notNull().default("catalog_page"), // catalog_page | procedure_page
  enabled: boolean("enabled").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastHash: text("last_hash"),
});

/** Catalogue officiel des marques importé (PDF). */
export const catalogs = pgTable("catalogs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  issueRef: text("issue_ref"),
  sourceUrl: text("source_url"),
  fileName: text("file_name"),
  storagePath: text("storage_path"),
  contentHash: text("content_hash").unique(),
  publishedAt: date("published_at"),
  status: catalogStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  pageCount: integer("page_count"),
  entriesCount: integer("entries_count").notNull().default(0),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

/** Demande de marque publiée, extraite d'un catalogue. */
export const publications = pgTable(
  "publications",
  {
    id: serial("id").primaryKey(),
    catalogId: integer("catalog_id").notNull().references(() => catalogs.id, { onDelete: "cascade" }),
    applicationNumber: text("application_number").notNull(),
    markName: text("mark_name").notNull(),
    markNameAr: text("mark_name_ar"),
    applicant: text("applicant"),
    applicantAddress: text("applicant_address"),
    representative: text("representative"),
    niceClasses: integer("nice_classes").array().notNull().default([]),
    goodsServices: text("goods_services"),
    filingDate: date("filing_date"),
    publicationDate: date("publication_date"),
    international: boolean("international").notNull().default(false),
    page: integer("page"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("publications_catalog_app_idx").on(t.catalogId, t.applicationNumber)],
);

/** Alerte : répond aux 5 questions du §5 (quoi, quel dossier, pourquoi, quelle action, quel délai/source). */
export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    type: alertTypeEnum("type").notNull(),
    rightId: integer("right_id").references(() => rights.id, { onDelete: "cascade" }),
    publicationId: integer("publication_id").references(() => publications.id, { onDelete: "cascade" }),
    whatHappened: text("what_happened").notNull(),
    whatHappenedAr: text("what_happened_ar"),
    why: text("why").notNull(),
    whyAr: text("why_ar"),
    suggestedAction: text("suggested_action").notNull(),
    suggestedActionAr: text("suggested_action_ar"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    legalBasis: text("legal_basis"),
    legalBasisAr: text("legal_basis_ar"),
    sourceUrl: text("source_url"),
    score: real("score"),
    scoreDetails: jsonb("score_details"),
    status: alertStatusEnum("status").notNull().default("new"),
    reviewedById: integer("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdByAgent: boolean("created_by_agent").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alerts_right_pub_idx").on(t.rightId, t.publicationId)],
);

/** Délais légaux (séparés des rappels internes J-30/J-15/J-7). */
export const deadlines = pgTable("deadlines", {
  id: serial("id").primaryKey(),
  rightId: integer("right_id").notNull().references(() => rights.id, { onDelete: "cascade" }),
  alertId: integer("alert_id").references(() => alerts.id, { onDelete: "set null" }),
  type: deadlineTypeEnum("type").notNull(),
  label: text("label").notNull(),
  labelAr: text("label_ar"),
  startDate: date("start_date"),
  dueDate: date("due_date").notNull(),
  legalBasis: text("legal_basis"),
  legalBasisAr: text("legal_basis_ar"),
  sourceUrl: text("source_url"),
  confirmed: boolean("confirmed").notNull().default(false),
  done: boolean("done").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull(), // schedule | manual | upload
  status: runStatusEnum("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  summary: text("summary"),
  summaryAr: text("summary_ar"),
  log: jsonb("log").$type<{ at: string; level: "info" | "warn" | "error"; msg: string }[]>().notNull().default([]),
  stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
});

/** Journal : qui a ajouté ou modifié quoi (utilisateur ou « Agent IA »). */
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorLabel: text("actor_label").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  details: jsonb("details"),
});

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Right = typeof rights.$inferSelect;
export type Publication = typeof publications.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type Deadline = typeof deadlines.$inferSelect;
export type Catalog = typeof catalogs.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
