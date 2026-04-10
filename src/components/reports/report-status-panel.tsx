"use client";

import { CheckCircle2, CircleAlert, CircleDashed, LoaderCircle } from "lucide-react";

import type { ReportStatusShell } from "@/lib/types/report";
import { formatDateTime } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReportStatusPanelProps = {
  status: ReportStatusShell | null;
  isPolling: boolean;
  errorMessage: string | null;
};

function formatDepartmentLabel(department: string) {
  return department
    .replace("success_services", "success / services")
    .replace("customer_support", "customer support")
    .replace("it_security", "IT / security")
    .replace("analytics_data", "analytics / data")
    .replaceAll("_", " ");
}

function formatRunStatusLabel(status: string) {
  switch (status) {
    case "queued":
      return "Queued";
    case "fetching":
    case "extracting":
    case "synthesizing":
      return "Building report";
    case "completed":
      return "Ready";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status.replaceAll("_", " ");
  }
}

function normalizeVisibleCopy(text: string) {
  return text
    .replaceAll("account-plan", "AI account brief")
    .replaceAll("account plan", "AI account brief")
    .replaceAll("Account plan", "AI account brief")
    .replaceAll("public report", "shareable report")
    .replaceAll("public web", "public-web")
    .replaceAll("Research completeness", "Evidence coverage")
    .replaceAll("report pipeline", "report build");
}

function getRunNarrative(status: ReportStatusShell) {
  const currentRun = status.currentRun;

  if (!currentRun) {
    return "Build progress will appear here as soon as status reporting starts.";
  }

  const currentStepState = currentRun.stepKey
    ? currentRun.progress.steps.find((step) => step.key === currentRun.stepKey)?.status
    : null;

  switch (currentRun.status) {
    case "queued":
      return "The brief has been created and is waiting for the next research worker.";
    case "fetching":
    case "extracting":
    case "synthesizing":
      if (currentStepState === "retrying") {
        return "The latest attempt hit a retryable issue. Account Atlas is keeping the run active and will retry this step automatically.";
      }

      return currentRun.stepLabel
        ? `${currentRun.stepLabel} is currently running. Newly persisted sources, facts, and report sections appear here as they are committed.`
        : "The brief is actively collecting and synthesizing public-web evidence.";
    case "completed":
      if (status.report.status === "ready_with_limited_coverage") {
        return "The latest run finished with limited coverage. Review the build log, warnings, and any missing exports before treating this as a full account brief.";
      }

      return "The latest run finished successfully. The AI account brief reflects the persisted public-web evidence gathered for this report.";
    case "failed":
      return "The latest run stopped before all sections completed. Review the build log and any partial output below to see what finished.";
    case "cancelled":
      return "The latest run was cancelled before completion. Review the partial output and build log for the last persisted state.";
    default:
      return "Build progress will appear here as soon as status reporting starts.";
  }
}

function getStepIcon(status: NonNullable<ReportStatusShell["currentRun"]>["progress"]["steps"][number]["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "failed":
      return <CircleAlert className="h-4 w-4 text-destructive" />;
    case "retrying":
    case "running":
      return <LoaderCircle className="h-4 w-4 animate-spin text-primary" />;
    default:
      return <CircleDashed className="h-4 w-4 text-muted-foreground" />;
  }
}

export function ReportStatusPanel({ status, isPolling, errorMessage }: ReportStatusPanelProps) {
  if (!status || !status.currentRun) {
    return (
      <Card className="border-border/70 bg-card/75 shadow-panel">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl">Build details</CardTitle>
          <p className="text-sm leading-7 text-foreground/70">
            No build details are available for this report yet.
          </p>
        </CardHeader>
      </Card>
    );
  }

  const currentRun = status.currentRun;

  return (
    <Card className="border-border/70 bg-card/82 shadow-panel">
      <CardHeader className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Build details</div>
            <CardTitle className="text-2xl">Report build details</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-full px-3 py-1" variant="secondary">
              {formatRunStatusLabel(currentRun.status)}
            </Badge>
            <Badge className="rounded-full px-3 py-1" variant="outline">
              {status.result.label}
            </Badge>
          </div>
        </div>
        <p className="max-w-3xl text-sm leading-7 text-foreground/70">{getRunNarrative(status)}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Current step</div>
            <div className="mt-2 font-medium text-foreground">{currentRun.stepLabel ?? "Queued for processing"}</div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Latest update</div>
            <div className="mt-2 font-medium text-foreground">{formatDateTime(currentRun.updatedAt)}</div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Evidence quality</div>
            <div className="mt-2 font-medium text-foreground">{status.result.label}</div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-3 text-sm leading-7 text-foreground/70">
          <div className="font-medium text-foreground">Status summary</div>
          <p className="mt-2">{normalizeVisibleCopy(status.message)}</p>
          <p className="mt-2">{normalizeVisibleCopy(status.result.summary)}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-4 rounded-[1.75rem] border border-border/70 bg-background/72 p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{currentRun.stepLabel ?? "Queued for processing"}</span>
            <span className="font-medium text-foreground">{currentRun.progressPercent}%</span>
          </div>
          <div className="h-3 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${currentRun.progressPercent}%` }}
            />
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {currentRun.progress.completedSteps} of {currentRun.progress.totalSteps} build steps completed
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-foreground">Build steps</h3>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {currentRun.progress.steps.map((step) => (
              <div
                key={step.key}
                className="flex items-start justify-between gap-3 rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-4"
              >
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">{getStepIcon(step.status)}</div>
                  <div>
                    <div className="font-medium text-foreground">{step.label}</div>
                    <div className="text-xs capitalize text-muted-foreground">{step.status.replaceAll("_", " ")}</div>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">{step.progressPercent}%</div>
                  <div>{step.attemptCount} tries</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Build log</h3>
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

        {currentRun.accountPlan ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">AI account brief snapshot</h3>
              <Badge className="rounded-full px-3 py-1 uppercase" variant="outline">
                {currentRun.accountPlan.overallAccountMotion.recommendedMotion.replaceAll("_", " ")}
              </Badge>
            </div>
            <div className="rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-4 text-sm text-muted-foreground">
              {currentRun.accountPlan.overallAccountMotion.rationale}
            </div>
            <div className="grid gap-3">
              {currentRun.accountPlan.topUseCases.map((useCase) => (
                <div
                  key={`${useCase.priorityRank}-${useCase.workflowName}`}
                  className="rounded-[1.5rem] border border-border/70 bg-background/72 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Top {useCase.priorityRank} • {formatDepartmentLabel(useCase.department)}
                      </div>
                      <div className="mt-1 font-medium text-foreground">{useCase.workflowName}</div>
                    </div>
                    <Badge className="rounded-full px-3 py-1" variant="secondary">
                      {useCase.scorecard.priorityScore}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{useCase.summary}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-[1.25rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
