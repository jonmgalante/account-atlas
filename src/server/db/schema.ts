import { sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { sourceTypeValues } from "@/lib/source";
import type { FinalAccountPlan, UseCaseScorecard } from "@/lib/types/account-plan";
import { useCaseDepartmentValues } from "@/lib/types/account-plan";
import type { ResearchSummary } from "@/lib/types/research";

type StoredPipelineStepState = {
  status: "pending" | "running" | "completed" | "failed";
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type StoredPipelineState = {
  currentStepKey: string | null;
  steps: Record<string, StoredPipelineStepState>;
};

const emptyJsonObject = sql`'{}'::jsonb`;
const emptyJsonArray = sql`'[]'::jsonb`;

export const reportStatusEnum = pgEnum("report_status", ["queued", "running", "ready", "failed"]);
export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "fetching",
  "extracting",
  "synthesizing",
  "completed",
  "failed",
  "cancelled",
]);
export const pipelineExecutionModeEnum = pgEnum("pipeline_execution_mode", ["inline", "vercel_queue"]);
export const sourceTypeEnum = pgEnum("source_type", sourceTypeValues);
export const sourceTierEnum = pgEnum("source_tier", ["primary", "secondary", "tertiary", "unknown"]);
export const factClassificationEnum = pgEnum("fact_classification", ["fact", "inference", "hypothesis"]);
export const factFreshnessEnum = pgEnum("fact_freshness", ["current", "recent", "stale", "unknown"]);
export const factSentimentEnum = pgEnum("fact_sentiment", ["positive", "neutral", "negative", "mixed", "unknown"]);
export const reportSectionEnum = pgEnum("report_section", [
  "company-brief",
  "fact-base",
  "ai-maturity-signals",
  "prioritized-use-cases",
  "recommended-motion",
  "stakeholder-hypotheses",
  "objections",
  "discovery-questions",
  "pilot-plan",
  "expansion-scenarios",
]);
export const motionRecommendationEnum = pgEnum("motion_recommendation", [
  "workspace",
  "api_platform",
  "hybrid",
  "undetermined",
]);
export const accountPlanDepartmentEnum = pgEnum("use_case_department", useCaseDepartmentValues);
export const artifactTypeEnum = pgEnum("artifact_type", [
  "markdown",
  "pdf",
  "structured_json",
  "source_bundle",
]);
export const eventLevelEnum = pgEnum("event_level", ["info", "warning", "error"]);
export const reportRequestOutcomeEnum = pgEnum("report_request_outcome", [
  "created",
  "reused_recent_completed",
  "reused_in_progress",
  "reused_recent_failed",
  "rate_limited",
  "dispatch_failed",
]);

export const reports = pgTable(
  "reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    shareId: varchar("share_id", { length: 24 }).notNull(),
    status: reportStatusEnum("status").notNull().default("queued"),
    normalizedInputUrl: text("normalized_input_url").notNull(),
    canonicalDomain: varchar("canonical_domain", { length: 255 }).notNull(),
    companyName: varchar("company_name", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("reports_share_id_idx").on(table.shareId),
    index("reports_status_idx").on(table.status),
    index("reports_canonical_domain_idx").on(table.canonicalDomain),
  ],
);

export const reportRuns = pgTable(
  "report_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: bigint("report_id", { mode: "number" })
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    status: runStatusEnum("status").notNull().default("queued"),
    executionMode: pipelineExecutionModeEnum("execution_mode").notNull().default("inline"),
    progressPercent: integer("progress_percent").notNull().default(0),
    stepKey: varchar("step_key", { length: 64 }),
    statusMessage: text("status_message").notNull().default("Report queued for processing."),
    pipelineState: jsonb("pipeline_state").$type<StoredPipelineState>().notNull().default(emptyJsonObject),
    queueMessageId: varchar("queue_message_id", { length: 128 }),
    vectorStoreId: varchar("vector_store_id", { length: 128 }),
    researchSummary: jsonb("research_summary").$type<ResearchSummary | null>(),
    accountPlan: jsonb("account_plan").$type<FinalAccountPlan | null>(),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
  },
  (table) => [
    index("report_runs_report_id_idx").on(table.reportId),
    index("report_runs_status_idx").on(table.status),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: bigint("report_id", { mode: "number" })
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    runId: bigint("run_id", { mode: "number" })
      .notNull()
      .references(() => reportRuns.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    canonicalDomain: varchar("canonical_domain", { length: 255 }).notNull(),
    title: text("title"),
    sourceType: sourceTypeEnum("source_type").notNull().default("other"),
    sourceTier: sourceTierEnum("source_tier").notNull().default("unknown"),
    mimeType: varchar("mime_type", { length: 255 }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    updatedAtHint: timestamp("updated_at_hint", { withTimezone: true }),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    contentHash: varchar("content_hash", { length: 128 }),
    textContent: text("text_content"),
    markdownContent: text("markdown_content"),
    storagePointers: jsonb("storage_pointers")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sources_report_id_idx").on(table.reportId),
    index("sources_run_id_idx").on(table.runId),
    index("sources_canonical_domain_idx").on(table.canonicalDomain),
    index("sources_report_run_content_hash_idx").on(table.reportId, table.runId, table.contentHash),
    uniqueIndex("sources_report_run_canonical_url_idx").on(table.reportId, table.runId, table.canonicalUrl),
  ],
);

export const facts = pgTable(
  "facts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: bigint("report_id", { mode: "number" })
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    runId: bigint("run_id", { mode: "number" })
      .notNull()
      .references(() => reportRuns.id, { onDelete: "cascade" }),
    sourceId: bigint("source_id", { mode: "number" }).references(() => sources.id, { onDelete: "set null" }),
    section: reportSectionEnum("section").notNull(),
    classification: factClassificationEnum("classification").notNull(),
    statement: text("statement").notNull(),
    rationale: text("rationale"),
    confidence: integer("confidence").notNull().default(50),
    freshness: factFreshnessEnum("freshness").notNull().default("unknown"),
    sentiment: factSentimentEnum("sentiment").notNull().default("unknown"),
    relevance: integer("relevance").notNull().default(50),
    evidenceSnippet: text("evidence_snippet"),
    sourceIds: jsonb("source_ids").$type<number[]>().notNull().default(emptyJsonArray),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("facts_report_id_idx").on(table.reportId),
    index("facts_run_id_idx").on(table.runId),
    index("facts_source_id_idx").on(table.sourceId),
    index("facts_section_idx").on(table.section),
  ],
);

export const useCases = pgTable(
  "use_cases",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: bigint("report_id", { mode: "number" })
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    runId: bigint("run_id", { mode: "number" })
      .notNull()
      .references(() => reportRuns.id, { onDelete: "cascade" }),
    department: accountPlanDepartmentEnum("department"),
    name: text("name").notNull(),
    summary: text("summary"),
    painPoint: text("pain_point"),
    whyNow: text("why_now"),
    likelyUsers: jsonb("likely_users").$type<string[]>().notNull().default(emptyJsonArray),
    expectedOutcome: text("expected_outcome"),
    priorityRank: integer("priority_rank"),
    overallScore: integer("overall_score"),
    impactScore: integer("impact_score"),
    feasibilityScore: integer("feasibility_score"),
    confidence: integer("confidence").notNull().default(50),
    scorecard: jsonb("scorecard").$type<UseCaseScorecard>(),
    priorityScore: numeric("priority_score", { precision: 6, scale: 2 }),
    motionRecommendation: motionRecommendationEnum("motion_recommendation")
      .notNull()
      .default("undetermined"),
    motionRationale: text("motion_rationale"),
    metrics: jsonb("metrics").$type<string[]>().notNull().default(emptyJsonArray),
    dependencies: jsonb("dependencies").$type<string[]>().notNull().default(emptyJsonArray),
    securityComplianceNotes: jsonb("security_compliance_notes").$type<string[]>().notNull().default(emptyJsonArray),
    evidenceFactIds: jsonb("evidence_fact_ids").$type<number[]>().notNull().default(emptyJsonArray),
    evidenceSourceIds: jsonb("evidence_source_ids").$type<number[]>().notNull().default(emptyJsonArray),
    openQuestions: jsonb("open_questions").$type<string[]>().notNull().default(emptyJsonArray),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("use_cases_report_id_idx").on(table.reportId), index("use_cases_run_id_idx").on(table.runId)],
);

export const stakeholders = pgTable(
  "stakeholders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: bigint("report_id", { mode: "number" })
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    runId: bigint("run_id", { mode: "number" })
      .notNull()
      .references(() => reportRuns.id, { onDelete: "cascade" }),
    name: text("name"),
    title: text("title"),
    department: text("department"),
    likelyRole: text("likely_role").notNull(),
    hypothesis: text("hypothesis"),
    rationale: text("rationale").notNull(),
    confidence: integer("confidence").notNull().default(50),
    evidenceFactIds: jsonb("evidence_fact_ids").$type<number[]>().notNull().default(emptyJsonArray),
    evidenceSourceIds: jsonb("evidence_source_ids").$type<number[]>().notNull().default(emptyJsonArray),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stakeholders_report_id_idx").on(table.reportId),
    index("stakeholders_run_id_idx").on(table.runId),
  ],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: bigint("report_id", { mode: "number" })
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    runId: bigint("run_id", { mode: "number" }).references(() => reportRuns.id, { onDelete: "set null" }),
    artifactType: artifactTypeEnum("artifact_type").notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    fileName: text("file_name"),
    storagePointers: jsonb("storage_pointers")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(emptyJsonObject),
    contentHash: varchar("content_hash", { length: 128 }),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("artifacts_report_id_idx").on(table.reportId),
    index("artifacts_run_id_idx").on(table.runId),
    uniqueIndex("artifacts_report_run_type_idx").on(table.reportId, table.runId, table.artifactType),
  ],
);

export const reportEvents = pgTable(
  "report_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: bigint("report_id", { mode: "number" })
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    runId: bigint("run_id", { mode: "number" }).references(() => reportRuns.id, { onDelete: "set null" }),
    level: eventLevelEnum("level").notNull().default("info"),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    stepKey: varchar("step_key", { length: 64 }),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("report_events_report_id_idx").on(table.reportId),
    index("report_events_run_id_idx").on(table.runId),
    index("report_events_event_type_idx").on(table.eventType),
  ],
);

export const reportRequests = pgTable(
  "report_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    requesterHash: varchar("requester_hash", { length: 128 }).notNull(),
    normalizedInputUrl: text("normalized_input_url").notNull(),
    canonicalDomain: varchar("canonical_domain", { length: 255 }).notNull(),
    outcome: reportRequestOutcomeEnum("outcome").notNull(),
    reportId: bigint("report_id", { mode: "number" }).references(() => reports.id, { onDelete: "set null" }),
    shareId: varchar("share_id", { length: 24 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("report_requests_requester_hash_idx").on(table.requesterHash),
    index("report_requests_canonical_domain_idx").on(table.canonicalDomain),
    index("report_requests_created_at_idx").on(table.createdAt),
  ],
);
