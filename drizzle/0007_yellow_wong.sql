ALTER TABLE "report_runs" ADD COLUMN "openai_response_id" varchar(128);--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "openai_response_status" varchar(32);--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "openai_response_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "openai_output_text" text;--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "canonical_report" jsonb;