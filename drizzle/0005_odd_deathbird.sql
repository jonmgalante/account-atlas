CREATE TYPE "public"."report_request_outcome" AS ENUM('created', 'reused_recent_completed', 'reused_in_progress', 'reused_recent_failed', 'rate_limited', 'dispatch_failed');--> statement-breakpoint
CREATE TABLE "report_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"requester_hash" varchar(128) NOT NULL,
	"normalized_input_url" text NOT NULL,
	"canonical_domain" varchar(255) NOT NULL,
	"outcome" "report_request_outcome" NOT NULL,
	"report_id" bigint,
	"share_id" varchar(24),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_requests" ADD CONSTRAINT "report_requests_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_requests_requester_hash_idx" ON "report_requests" USING btree ("requester_hash");--> statement-breakpoint
CREATE INDEX "report_requests_canonical_domain_idx" ON "report_requests" USING btree ("canonical_domain");--> statement-breakpoint
CREATE INDEX "report_requests_created_at_idx" ON "report_requests" USING btree ("created_at");