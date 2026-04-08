ALTER TABLE "sources" ALTER COLUMN "source_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sources" ALTER COLUMN "source_type" SET DEFAULT 'other'::text;--> statement-breakpoint
DROP TYPE "public"."source_type";--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('company_homepage', 'about_page', 'product_page', 'solutions_page', 'pricing_page', 'customer_page', 'security_page', 'privacy_page', 'docs_page', 'developer_page', 'careers_page', 'blog_page', 'newsroom_page', 'investor_relations_page', 'investor_report', 'status_page', 'changelog_page', 'pdf_document', 'company_site', 'other');--> statement-breakpoint
UPDATE "sources"
SET "source_type" = CASE "source_type"
  WHEN 'company-site' THEN 'company_site'
  WHEN 'documentation' THEN 'docs_page'
  WHEN 'filing' THEN 'investor_report'
  WHEN 'news' THEN 'newsroom_page'
  WHEN 'analyst' THEN 'other'
  WHEN 'social' THEN 'other'
  ELSE 'other'
END;--> statement-breakpoint
ALTER TABLE "sources" ALTER COLUMN "source_type" SET DEFAULT 'other'::"public"."source_type";--> statement-breakpoint
ALTER TABLE "sources" ALTER COLUMN "source_type" SET DATA TYPE "public"."source_type" USING "source_type"::"public"."source_type";--> statement-breakpoint
DROP INDEX "sources_report_run_type_url_idx";--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "canonical_url" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "discovered_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "updated_at_hint" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "text_content" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "markdown_content" text;--> statement-breakpoint
UPDATE "sources" SET "canonical_url" = "normalized_url" WHERE "canonical_url" IS NULL;--> statement-breakpoint
ALTER TABLE "sources" ALTER COLUMN "canonical_url" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "sources_report_run_content_hash_idx" ON "sources" USING btree ("report_id","run_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_report_run_canonical_url_idx" ON "sources" USING btree ("report_id","run_id","canonical_url");--> statement-breakpoint
