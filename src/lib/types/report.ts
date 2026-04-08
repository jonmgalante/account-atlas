import type { ResearchSummary } from "@/lib/types/research";
import type { SourceType } from "@/lib/source";

export type ReportLifecycleStatus = "queued" | "running" | "ready" | "failed";
export type MotionRecommendation = "workspace" | "api_platform" | "hybrid" | "undetermined";
export type ReportArtifactType = "markdown" | "pdf" | "structured_json" | "source_bundle";
export type ReportReuseReason = "recent_completed" | "in_progress" | "recent_failed" | null;
export type ReportContentState = "pending" | "partial" | "ready" | "failed";

export type ReportRunLifecycleStatus =
  | "queued"
  | "fetching"
  | "extracting"
  | "synthesizing"
  | "completed"
  | "failed"
  | "cancelled";

export type ReportEventLevel = "info" | "warning" | "error";

export type PipelineExecutionMode = "inline" | "vercel_queue";

export type PipelineStepKey =
  | "normalize_target"
  | "crawl_company_site"
  | "enrich_external_sources"
  | "build_fact_base"
  | "generate_account_plan"
  | "export_markdown"
  | "export_pdf"
  | "finalize_report";

export type PipelineStepStatus = "pending" | "running" | "retrying" | "completed" | "failed";

export type ReportSectionKey =
  | "company-brief"
  | "fact-base"
  | "ai-maturity-signals"
  | "prioritized-use-cases"
  | "recommended-motion"
  | "stakeholder-hypotheses"
  | "objections"
  | "discovery-questions"
  | "pilot-plan"
  | "expansion-scenarios";

export type ReportSectionShell = {
  key: ReportSectionKey;
  label: string;
  status: "pending" | "ready";
};

export type ReportSummary = {
  shareId: string;
  status: ReportLifecycleStatus;
  normalizedInputUrl: string;
  canonicalDomain: string;
  companyName: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ReportRunStep = {
  key: PipelineStepKey;
  label: string;
  status: PipelineStepStatus;
  progressPercent: number;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type ReportRunProgress = {
  totalSteps: number;
  completedSteps: number;
  currentStepKey: PipelineStepKey | null;
  currentStepLabel: string | null;
  steps: ReportRunStep[];
};

export type ReportRunSummary = {
  id: number;
  status: ReportRunLifecycleStatus;
  progressPercent: number;
  stepKey: PipelineStepKey | null;
  stepLabel: string | null;
  executionMode: PipelineExecutionMode;
  statusMessage: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  progress: ReportRunProgress;
  researchSummary: ResearchSummary | null;
  accountPlan: import("@/lib/types/account-plan").FinalAccountPlan | null;
};

export type ReportProgressEvent = {
  id: number;
  level: ReportEventLevel;
  eventType: string;
  stepKey: PipelineStepKey | null;
  message: string;
  occurredAt: string;
};

export type ReportSourceRecord = {
  id: number;
  title: string;
  url: string;
  canonicalDomain: string;
  sourceType: SourceType;
  sourceTier: "primary" | "secondary" | "tertiary" | "unknown";
  mimeType: string | null;
  publishedAt: string | null;
  retrievedAt: string | null;
  discoveredAt: string;
  summary: string | null;
};

export type ReportFactRecord = {
  id: number;
  section: ReportSectionKey;
  classification: "fact" | "inference" | "hypothesis";
  statement: string;
  rationale: string | null;
  confidence: number;
  freshness: "current" | "recent" | "stale" | "unknown";
  sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown";
  relevance: number;
  evidenceSnippet: string | null;
  sourceIds: number[];
};

export type ReportSectionAssessment = ReportSectionShell & {
  confidence: number | null;
  confidenceRationale: string | null;
  completenessLabel: string;
};

export type ReportThinEvidenceWarning = {
  id: string;
  level: "info" | "warning";
  title: string;
  message: string;
  sourceIds: number[];
};

export type ReportResultMeta = {
  state: ReportContentState;
  label: string;
  summary: string;
  hasThinEvidence: boolean;
  hasPartialData: boolean;
};

export type ReportArtifactRecord = {
  id: number;
  artifactType: ReportArtifactType;
  mimeType: string;
  fileName: string | null;
  sizeBytes: number | null;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
  downloadPath: string;
};

export type ReportShell = {
  report: ReportSummary;
  currentRun: ReportRunSummary | null;
  sections: ReportSectionShell[];
  result: ReportResultMeta;
  message: string;
};

export type ReportDocument = ReportShell & {
  recentEvents: ReportProgressEvent[];
  facts: ReportFactRecord[];
  sources: ReportSourceRecord[];
  artifacts: ReportArtifactRecord[];
  sectionAssessments: ReportSectionAssessment[];
  thinEvidenceWarnings: ReportThinEvidenceWarning[];
};

export type CreateReportResponse = {
  shareId: string;
  runId: number;
  shareUrl: string;
  statusUrl: string;
  executionMode: PipelineExecutionMode;
  disposition: "created" | "reused";
  reuseReason: ReportReuseReason;
  report: ReportSummary;
  currentRun: ReportRunSummary;
  message: string;
};

export type ReportStatusShell = {
  shareId: string;
  statusUrl: string;
  report: Pick<ReportSummary, "shareId" | "status" | "createdAt" | "updatedAt" | "completedAt">;
  currentRun: ReportRunSummary | null;
  result: ReportResultMeta;
  recentEvents: ReportProgressEvent[];
  pollAfterMs: number;
  isTerminal: boolean;
  message: string;
};

export type ReportPageStatus = ReportLifecycleStatus | "not-found" | "unavailable";

export type ReportPageModel = {
  shareId: string;
  status: ReportPageStatus;
  title: string;
  summary: string;
  companyUrl: string;
  canonicalDomain: string;
  companyName: string | null;
  createdAt: string;
  sections: ReportSectionShell[];
  completenessSummary: string;
  confidenceSummary: string;
  message: string;
};
