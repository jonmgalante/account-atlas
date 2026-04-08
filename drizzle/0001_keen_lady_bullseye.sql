CREATE TYPE "public"."pipeline_execution_mode" AS ENUM('inline', 'vercel_queue');--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "execution_mode" "pipeline_execution_mode" DEFAULT 'inline' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "status_message" text DEFAULT 'Report queued for processing.' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "pipeline_state" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "error_code" varchar(64);--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "last_heartbeat_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_report_run_type_idx" ON "artifacts" USING btree ("report_id","run_id","artifact_type");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_report_run_type_url_idx" ON "sources" USING btree ("report_id","run_id","source_type","normalized_url");