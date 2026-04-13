"use client";

import { AlertCircle, CheckCircle2, CircleDashed, LoaderCircle } from "lucide-react";

import { isCanonicalGroundedFallbackReport } from "@/lib/canonical-report";
import type { ReportStatusShell } from "@/lib/types/report";
import { formatDateTime } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReportStatusPanelProps = {
  status: ReportStatusShell | null;
  isPolling: boolean;
  errorMessage: string | null;
};

function formatDisplayStatusLabel(status: ReportStatusShell["displayStatus"]) {
  switch (status) {
    case "queued":
      return "In progress";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Ready";
    case "completed_with_grounded_fallback":
      return "Grounded brief ready";
    case "failed":
      return "Failed";
    default:
      return "Unavailable";
  }
}

function normalizeBadgeComparisonText(text: string) {
  return text.toLowerCase().replaceAll("completed", "complete").replaceAll("ready", "").replace(/\s+/g, "");
}

function normalizeVisibleCopy(text: string) {
  return text
    .replaceAll("account-plan", "AI account brief")
    .replaceAll("account plan", "AI account brief")
    .replaceAll("Account plan", "AI account brief")
    .replaceAll("public report", "shareable report")
    .replaceAll("public web", "public-web")
    .replaceAll("Research completeness", "Evidence coverage")
    .replaceAll("report pipeline", "report build")
    .replaceAll("canonical report", "saved brief");
}

function getStatusIcon(displayStatus: ReportStatusShell["displayStatus"], isPolling: boolean) {
  if (displayStatus === "failed") {
    return <AlertCircle className="h-4 w-4 text-destructive" />;
  }

  if (displayStatus === "completed" || displayStatus === "completed_with_grounded_fallback") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }

  if (displayStatus === "queued" || displayStatus === "in_progress") {
    return <LoaderCircle className={`h-4 w-4 text-primary ${isPolling ? "animate-spin" : ""}`} />;
  }

  return <CircleDashed className="h-4 w-4 text-muted-foreground" />;
}

function getRunNarrative(status: ReportStatusShell) {
  const currentRun = status.currentRun;

  if (!currentRun) {
    return "Run updates appear here once the report starts processing.";
  }

  switch (status.displayStatus ?? currentRun.displayStatus) {
    case "queued":
      return "Researching the company and drafting the brief. This page updates automatically.";
    case "in_progress":
      return "Researching the company and drafting the brief. This page updates automatically.";
    case "completed_with_grounded_fallback":
      return "The report is ready as a grounded brief. The verified company snapshot and citations stay visible while stronger opportunity claims are held back.";
    case "completed":
      return "The report is ready and the page is rendering from the saved brief.";
    case "failed":
      return "The latest run stopped before a usable shareable brief was finalized.";
    default:
      return "Run updates appear here once the report starts processing.";
  }
}

export function ReportStatusPanel({ status, isPolling, errorMessage }: ReportStatusPanelProps) {
  if (!status || !status.currentRun) {
    return (
      <Card className="border-border/70 bg-card/75 shadow-panel">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl">Report details</CardTitle>
          <p className="text-sm leading-7 text-foreground/70">
            No run details are available for this report yet.
          </p>
        </CardHeader>
      </Card>
    );
  }

  const currentRun = status.currentRun;
  const displayStatus = status.displayStatus ?? currentRun.displayStatus;
  const isPreparing = displayStatus === "queued" || displayStatus === "in_progress";
  const canonicalReport = currentRun.canonicalReport;
  const evidenceCoverage =
    canonicalReport?.evidence_coverage.research_completeness_score ??
    currentRun.researchSummary?.researchCompletenessScore ??
    null;
  const confidenceBand =
    canonicalReport?.evidence_coverage.overall_confidence.confidence_band ??
    currentRun.researchSummary?.overallConfidence ??
    null;
  const briefSnapshot = canonicalReport
    ? isCanonicalGroundedFallbackReport(canonicalReport)
      ? canonicalReport.grounded_fallback?.summary
      : canonicalReport.recommended_motion.rationale
    : currentRun.accountPlan?.publishMode === "grounded_fallback"
      ? currentRun.accountPlan.groundedFallbackBrief?.summary
      : currentRun.accountPlan?.overallAccountMotion.rationale;
  const shouldShowResultBadge =
    normalizeBadgeComparisonText(status.result.label) !==
    normalizeBadgeComparisonText(formatDisplayStatusLabel(displayStatus));

  return (
    <Card className="border-border/70 bg-card/82 shadow-panel">
      <CardHeader className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Report details</div>
            <CardTitle className="text-2xl">Run details</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-full px-3 py-1" variant="secondary">
              {formatDisplayStatusLabel(displayStatus)}
            </Badge>
            {shouldShowResultBadge ? (
              <Badge className="rounded-full px-3 py-1" variant="outline">
                {status.result.label}
              </Badge>
            ) : null}
          </div>
        </div>
        <p className="max-w-3xl text-sm leading-7 text-foreground/70">{getRunNarrative(status)}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Run state</div>
            <div className="mt-2 flex items-center gap-2 font-medium text-foreground">
              {getStatusIcon(displayStatus, isPolling)}
              {formatDisplayStatusLabel(displayStatus)}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Latest update</div>
            <div className="mt-2 font-medium text-foreground">{formatDateTime(currentRun.updatedAt)}</div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Evidence coverage</div>
            <div className="mt-2 font-medium text-foreground">
              {evidenceCoverage === null ? (isPreparing ? "In progress" : status.result.label) : `${evidenceCoverage}/100`}
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-3 text-sm leading-7 text-foreground/70">
          <div className="font-medium text-foreground">{isPreparing ? "Preparing" : "Status summary"}</div>
          {isPreparing ? (
            <p className="mt-2">Sections appear here automatically as research is ready.</p>
          ) : (
            <>
              <p className="mt-2">{normalizeVisibleCopy(status.message)}</p>
              <p className="mt-2">{normalizeVisibleCopy(status.result.summary)}</p>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Research job</div>
            <div className="mt-2 font-medium capitalize text-foreground">
              {currentRun.openaiResponseStatus?.replaceAll("_", " ") ?? (isPreparing ? "In progress" : "Not started")}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Confidence</div>
            <div className="mt-2 font-medium capitalize text-foreground">{confidenceBand ?? (isPreparing ? "In progress" : "Pending")}</div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Saved report</div>
            <div className="mt-2 font-medium text-foreground">
              {canonicalReport ? "Stored and rendering" : isPreparing ? "In progress" : "Waiting on saved brief"}
            </div>
          </div>
        </div>

        {briefSnapshot ? (
          <div className="rounded-[1.75rem] border border-border/70 bg-background/72 p-4">
            <div className="font-medium text-foreground">Brief snapshot</div>
            <p className="mt-2 text-sm leading-7 text-foreground/70">{briefSnapshot}</p>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Recent updates</h3>
            {isPolling ? <span className="text-xs text-muted-foreground">Checking for updates…</span> : null}
          </div>
          <div className="space-y-2">
            {status.recentEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-4 text-sm text-muted-foreground"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-foreground">{event.message}</div>
                  <div className="text-xs">{formatDateTime(event.occurredAt)}</div>
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {event.eventType.replaceAll(".", " ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-[1.25rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
