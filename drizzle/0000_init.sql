CREATE TYPE "public"."alert_status" AS ENUM('new', 'validated', 'dismissed', 'done');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('similarity', 'deadline', 'procedural', 'status');--> statement-breakpoint
CREATE TYPE "public"."catalog_status" AS ENUM('pending', 'processing', 'done', 'error');--> statement-breakpoint
CREATE TYPE "public"."deadline_type" AS ENUM('opposition', 'renewal', 'annuity', 'response', 'other');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('fr', 'ar');--> statement-breakpoint
CREATE TYPE "public"."right_type" AS ENUM('marque', 'brevet', 'dessin');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'avocat', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'success', 'partial', 'error');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" text,
	"summary_ar" text,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "alert_type" NOT NULL,
	"right_id" integer,
	"publication_id" integer,
	"what_happened" text NOT NULL,
	"what_happened_ar" text,
	"why" text NOT NULL,
	"why_ar" text,
	"suggested_action" text NOT NULL,
	"suggested_action_ar" text,
	"start_date" date,
	"due_date" date,
	"legal_basis" text,
	"legal_basis_ar" text,
	"source_url" text,
	"score" real,
	"score_details" jsonb,
	"status" "alert_status" DEFAULT 'new' NOT NULL,
	"reviewed_by_id" integer,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_by_agent" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" integer,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "catalogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"issue_ref" text,
	"source_url" text,
	"file_name" text,
	"storage_path" text,
	"content_hash" text,
	"published_at" date,
	"status" "catalog_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"page_count" integer,
	"entries_count" integer DEFAULT 0 NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "catalogs_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"email" text,
	"phone" text,
	"rc_number" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" serial PRIMARY KEY NOT NULL,
	"right_id" integer NOT NULL,
	"alert_id" integer,
	"type" "deadline_type" NOT NULL,
	"label" text NOT NULL,
	"label_ar" text,
	"start_date" date,
	"due_date" date NOT NULL,
	"legal_basis" text,
	"legal_basis_ar" text,
	"source_url" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"right_id" integer NOT NULL,
	"kind" text DEFAULT 'correspondance' NOT NULL,
	"title" text NOT NULL,
	"file_name" text,
	"storage_path" text,
	"received_at" date,
	"notification_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalog_id" integer NOT NULL,
	"application_number" text NOT NULL,
	"mark_name" text NOT NULL,
	"mark_name_ar" text,
	"applicant" text,
	"applicant_address" text,
	"representative" text,
	"nice_classes" integer[] DEFAULT '{}' NOT NULL,
	"goods_services" text,
	"filing_date" date,
	"publication_date" date,
	"international" boolean DEFAULT false NOT NULL,
	"page" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rights" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"type" "right_type" DEFAULT 'marque' NOT NULL,
	"holder" text NOT NULL,
	"holder_ar" text,
	"application_number" text,
	"registration_number" text,
	"name" text NOT NULL,
	"name_ar" text,
	"image_url" text,
	"country" text DEFAULT 'MA' NOT NULL,
	"goods_services" text,
	"nice_classes" integer[] DEFAULT '{}' NOT NULL,
	"filing_date" date,
	"priority_date" date,
	"publication_date" date,
	"registration_date" date,
	"expiry_date" date,
	"status" text DEFAULT 'déposée' NOT NULL,
	"next_action" text,
	"responsible_id" integer,
	"notes" text,
	"watch" boolean DEFAULT true NOT NULL,
	"source_url" text,
	"catalog_ref" text,
	"catalog_page" integer,
	"last_verified_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"kind" text DEFAULT 'catalog_page' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"last_hash" text,
	CONSTRAINT "sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'avocat' NOT NULL,
	"locale" "locale" DEFAULT 'fr' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_right_id_rights_id_fk" FOREIGN KEY ("right_id") REFERENCES "public"."rights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_right_id_rights_id_fk" FOREIGN KEY ("right_id") REFERENCES "public"."rights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_right_id_rights_id_fk" FOREIGN KEY ("right_id") REFERENCES "public"."rights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights" ADD CONSTRAINT "rights_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights" ADD CONSTRAINT "rights_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_right_pub_idx" ON "alerts" USING btree ("right_id","publication_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_catalog_app_idx" ON "publications" USING btree ("catalog_id","application_number");