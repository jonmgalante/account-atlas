CREATE TYPE "public"."use_case_department" AS ENUM('sales', 'marketing', 'customer_support', 'success_services', 'finance', 'legal', 'operations', 'hr', 'engineering', 'product', 'it_security', 'analytics_data');--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "account_plan" jsonb;--> statement-breakpoint
ALTER TABLE "stakeholders" ADD COLUMN "hypothesis" text;--> statement-breakpoint
ALTER TABLE "use_cases" ADD COLUMN "department" "use_case_department";--> statement-breakpoint
ALTER TABLE "use_cases" ADD COLUMN "pain_point" text;--> statement-breakpoint
ALTER TABLE "use_cases" ADD COLUMN "why_now" text;--> statement-breakpoint
ALTER TABLE "use_cases" ADD COLUMN "likely_users" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "use_cases" ADD COLUMN "expected_outcome" text;--> statement-breakpoint
ALTER TABLE "use_cases" ADD COLUMN "scorecard" jsonb;--> statement-breakpoint
ALTER TABLE "use_cases" ADD COLUMN "priority_score" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "use_cases" ADD COLUMN "motion_rationale" text;--> statement-breakpoint
ALTER TABLE "use_cases" ADD COLUMN "security_compliance_notes" jsonb DEFAULT '[]'::jsonb NOT NULL;