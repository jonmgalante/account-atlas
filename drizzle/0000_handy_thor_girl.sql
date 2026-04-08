CREATE TYPE "public"."artifact_type" AS ENUM('markdown', 'pdf', 'structured_json', 'source_bundle');--> statement-breakpoint
CREATE TYPE "public"."event_level" AS ENUM('info', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."fact_classification" AS ENUM('fact', 'inference', 'hypothesis');--> statement-breakpoint
CREATE TYPE "public"."fact_freshness" AS ENUM('current', 'recent', 'stale', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fact_sentiment" AS ENUM('positive', 'neutral', 'negative', 'mixed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."motion_recommendation" AS ENUM('workspace', 'api_platform', 'hybrid', 'undetermined');--> statement-breakpoint
CREATE TYPE "public"."report_section" AS ENUM('company-brief', 'fact-base', 'ai-maturity-signals', 'prioritized-use-cases', 'recommended-motion', 'stakeholder-hypotheses', 'objections', 'discovery-questions', 'pilot-plan', 'expansion-scenarios');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('queued', 'running', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'fetching', 'extracting', 'synthesizing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."source_tier" AS ENUM('primary', 'secondary', 'tertiary', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('company-site', 'news', 'filing', 'documentation', 'analyst', 'social', 'other');--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"run_id" bigint,
	"artifact_type" "artifact_type" NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"file_name" text,
	"storage_pointers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" varchar(128),
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"run_id" bigint NOT NULL,
	"source_id" bigint,
	"section" "report_section" NOT NULL,
	"classification" "fact_classification" NOT NULL,
	"statement" text NOT NULL,
	"rationale" text,
	"confidence" integer DEFAULT 50 NOT NULL,
	"freshness" "fact_freshness" DEFAULT 'unknown' NOT NULL,
	"sentiment" "fact_sentiment" DEFAULT 'unknown' NOT NULL,
	"relevance" integer DEFAULT 50 NOT NULL,
	"evidence_snippet" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"run_id" bigint,
	"level" "event_level" DEFAULT 'info' NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"step_key" varchar(64),
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"step_key" varchar(64),
	"queue_message_id" varchar(128),
	"vector_store_id" varchar(128),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"share_id" varchar(24) NOT NULL,
	"status" "report_status" DEFAULT 'queued' NOT NULL,
	"normalized_input_url" text NOT NULL,
	"canonical_domain" varchar(255) NOT NULL,
	"company_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"run_id" bigint NOT NULL,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"canonical_domain" varchar(255) NOT NULL,
	"title" text,
	"source_type" "source_type" DEFAULT 'other' NOT NULL,
	"source_tier" "source_tier" DEFAULT 'unknown' NOT NULL,
	"mime_type" varchar(255),
	"published_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone,
	"content_hash" varchar(128),
	"storage_pointers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stakeholders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"run_id" bigint NOT NULL,
	"name" text,
	"title" text,
	"department" text,
	"likely_role" text NOT NULL,
	"rationale" text NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"evidence_fact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "use_cases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"run_id" bigint NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"priority_rank" integer,
	"overall_score" integer,
	"impact_score" integer,
	"feasibility_score" integer,
	"confidence" integer DEFAULT 50 NOT NULL,
	"motion_recommendation" "motion_recommendation" DEFAULT 'undetermined' NOT NULL,
	"metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_fact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_report_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_run_id_report_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_events" ADD CONSTRAINT "report_events_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_events" ADD CONSTRAINT "report_events_run_id_report_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_run_id_report_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_run_id_report_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "use_cases" ADD CONSTRAINT "use_cases_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "use_cases" ADD CONSTRAINT "use_cases_run_id_report_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_report_id_idx" ON "artifacts" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "artifacts_run_id_idx" ON "artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "facts_report_id_idx" ON "facts" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "facts_run_id_idx" ON "facts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "facts_source_id_idx" ON "facts" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "facts_section_idx" ON "facts" USING btree ("section");--> statement-breakpoint
CREATE INDEX "report_events_report_id_idx" ON "report_events" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_events_run_id_idx" ON "report_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "report_events_event_type_idx" ON "report_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "report_runs_report_id_idx" ON "report_runs" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_runs_status_idx" ON "report_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_share_id_idx" ON "reports" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_canonical_domain_idx" ON "reports" USING btree ("canonical_domain");--> statement-breakpoint
CREATE INDEX "sources_report_id_idx" ON "sources" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "sources_run_id_idx" ON "sources" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "sources_canonical_domain_idx" ON "sources" USING btree ("canonical_domain");--> statement-breakpoint
CREATE INDEX "stakeholders_report_id_idx" ON "stakeholders" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "stakeholders_run_id_idx" ON "stakeholders" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "use_cases_report_id_idx" ON "use_cases" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "use_cases_run_id_idx" ON "use_cases" USING btree ("run_id");