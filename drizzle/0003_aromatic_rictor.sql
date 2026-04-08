ALTER TYPE "public"."source_type" ADD VALUE 'earnings_release' BEFORE 'status_page';--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'company_social_profile' BEFORE 'status_page';--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'executive_social_profile' BEFORE 'status_page';--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'incident_page' BEFORE 'changelog_page';--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'support_page' BEFORE 'changelog_page';--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'news_article' BEFORE 'pdf_document';--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'review_platform' BEFORE 'pdf_document';--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'complaint_forum' BEFORE 'pdf_document';--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'competitor_page' BEFORE 'pdf_document';--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'market_analysis' BEFORE 'pdf_document';--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN "source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "research_summary" jsonb;