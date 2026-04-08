"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpenText,
  Download,
  ExternalLink,
  LayoutList,
  Link2,
  LoaderCircle,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";

import { Container } from "@/components/layout/container";
import { SectionFrame } from "@/components/layout/section-frame";
import { ReportStatusPanel } from "@/components/reports/report-status-panel";
import { EvidencePills } from "@/components/reports/evidence-pills";
import { ReportSourcePanel } from "@/components/reports/source-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReportStatus } from "@/hooks/use-report-status";
import { formatDateTime } from "@/lib/date";
import { addRecentReport } from "@/lib/recent-reports";
import type { ApiResponse } from "@/lib/types/api";
import type {
  ReportDocument,
  ReportFactRecord,
  ReportStatusShell,
} from "@/lib/types/report";
import { cn } from "@/lib/utils";

type ReportExperienceProps = {
  shareId: string;
  initialDocument: ReportDocument;
  initialStatus: ReportStatusShell | null;
};

const reportAnchorItems = [
  { id: "overview", label: "Overview" },
  { id: "research", label: "Research" },
  { id: "use-cases", label: "Use Cases" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "pilot-plan", label: "Pilot Plan" },
  { id: "expansion-scenarios", label: "Expansion Scenarios" },
  { id: "sources", label: "Sources" },
] as const;

function formatMotionLabel(motion: string) {
  return motion === "api_platform" ? "API platform" : motion.replaceAll("_", " ");
}

function formatDepartmentLabel(department: string) {
  return department
    .replace("success_services", "success / services")
    .replace("customer_support", "customer support")
    .replace("it_security", "IT / security")
    .replace("analytics_data", "analytics / data")
    .replaceAll("_", " ");
}

function formatSourceTypeLabel(sourceType: string) {
  return sourceType
    .replace("investor_relations", "investor relations")
    .replace("company_social_profile", "company social")
    .replace("executive_social_profile", "executive social")
    .replaceAll("_", " ");
}

function classificationBadgeClass(classification: ReportFactRecord["classification"]) {
  switch (classification) {
    case "fact":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "inference":
      return "bg-amber-100 text-amber-950 border-amber-200";
    default:
      return "bg-sky-100 text-sky-950 border-sky-200";
  }
}

function confidenceTone(confidence: number | null) {
  if (confidence === null) {
    return "text-muted-foreground";
  }

  if (confidence >= 75) {
    return "text-emerald-700";
  }

  if (confidence >= 55) {
    return "text-amber-700";
  }

  return "text-destructive";
}

function EmptySection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed border-border/80 bg-gradient-to-br from-background/90 via-background/70 to-white/70 shadow-none">
      <CardContent className="p-6 text-sm leading-7 text-muted-foreground">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Awaiting evidence</div>
        <div className="mt-2 font-medium text-foreground">{title}</div>
        <p className="mt-2">{description}</p>
      </CardContent>
    </Card>
  );
}

function ReportSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 space-y-6 border-t border-border/70 pt-8 sm:pt-10">
      <div className="space-y-4">
        <div className="h-px w-16 bg-gradient-to-r from-primary/40 to-transparent" />
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">{eyebrow}</p>
        <div className="space-y-2">
          <h2 className="text-3xl leading-tight text-primary sm:text-4xl">{title}</h2>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function ReportExperience({
  shareId,
  initialDocument,
  initialStatus,
}: ReportExperienceProps) {
  const { status, isPolling, errorMessage } = useReportStatus({
    shareId,
    initialStatus,
  });
  const [document, setDocument] = useState(initialDocument);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [isRefreshingDocument, setIsRefreshingDocument] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);
  const [isMobileSourcePanelOpen, setIsMobileSourcePanelOpen] = useState(false);

  useEffect(() => {
    addRecentReport({
      shareId: document.report.shareId,
      companyUrl: document.report.normalizedInputUrl,
      createdAt: document.report.createdAt,
    });
  }, [document.report.createdAt, document.report.normalizedInputUrl, document.report.shareId]);

  useEffect(() => {
    const currentRunUpdatedAt = status?.currentRun?.updatedAt ?? null;
    const reportUpdatedAt = status?.report.updatedAt ?? null;

    if (!currentRunUpdatedAt && !reportUpdatedAt) {
      return;
    }

    if (
      currentRunUpdatedAt === document.currentRun?.updatedAt &&
      reportUpdatedAt === document.report.updatedAt
    ) {
      return;
    }

    let cancelled = false;

    const refreshDocument = async () => {
      setIsRefreshingDocument(true);

      try {
        const response = await fetch(`/api/reports/${shareId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Report request failed with ${response.status}`);
        }

        const payload = (await response.json()) as ApiResponse<ReportDocument>;

        if (!payload.ok) {
          throw new Error(payload.error.message);
        }

        if (cancelled) {
          return;
        }

        setDocument(payload.data);
        setDocumentError(null);
      } catch {
        if (!cancelled) {
          setDocumentError("Unable to refresh the full report payload right now.");
        }
      } finally {
        if (!cancelled) {
          setIsRefreshingDocument(false);
        }
      }
    };

    void refreshDocument();

    return () => {
      cancelled = true;
    };
  }, [
    document.currentRun?.updatedAt,
    document.report.updatedAt,
    shareId,
    status?.currentRun?.updatedAt,
    status?.report.updatedAt,
  ]);

  useEffect(() => {
    if (selectedSourceIds.length > 0) {
      return;
    }

    const defaultSourceIds =
      document.currentRun?.accountPlan?.topUseCases[0]?.evidenceSourceIds ??
      document.currentRun?.researchSummary?.sourceIds.slice(0, 2) ??
      [];

    if (defaultSourceIds.length > 0) {
      setSelectedSourceIds(defaultSourceIds);
    }
  }, [
    document.currentRun?.accountPlan?.topUseCases,
    document.currentRun?.researchSummary?.sourceIds,
    selectedSourceIds.length,
  ]);

  const currentRun = document.currentRun;
  const researchSummary = currentRun?.researchSummary ?? null;
  const accountPlan = currentRun?.accountPlan ?? null;
  const markdownArtifact = document.artifacts.find((artifact) => artifact.artifactType === "markdown") ?? null;
  const pdfArtifact = document.artifacts.find((artifact) => artifact.artifactType === "pdf") ?? null;
  const canShowCompletedReport = Boolean(researchSummary || accountPlan || document.sources.length > 0);
  const liveReportStatus = status?.report.status ?? document.report.status;
  const readySectionCount = document.sections.filter((section) => section.status === "ready").length;
  const researchCompleteness = researchSummary?.researchCompletenessScore ?? null;
  const motionRecommendation = accountPlan
    ? formatMotionLabel(accountPlan.overallAccountMotion.recommendedMotion)
    : "Pending";
  const retryHref = `/?url=${encodeURIComponent(document.report.normalizedInputUrl)}`;

  const handleSelectSources = (sourceIds: number[]) => {
    setSelectedSourceIds(sourceIds);
    setIsMobileSourcePanelOpen(true);
  };

  return (
    <SectionFrame className="py-10 sm:py-14">
      <Container className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/82 px-4 py-2 text-sm text-foreground transition hover:border-primary/30 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to submit
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              {isRefreshingDocument ? (
                <Badge className="rounded-full px-3 py-1" variant="outline">
                  <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Refreshing report
                </Badge>
              ) : null}
              <Badge className="rounded-full px-4 py-1.5 capitalize" variant="secondary">
                {document.result.label}
              </Badge>
              {document.result.hasThinEvidence ? (
                <Badge className="rounded-full px-4 py-1.5" variant="outline">
                  Thin evidence
                </Badge>
              ) : null}
              <Badge className="rounded-full px-4 py-1.5 capitalize" variant="outline">
                {liveReportStatus.replaceAll("-", " ")}
              </Badge>
            </div>
          </div>

          <Card className="overflow-hidden border-white/80 bg-white/88 shadow-panel">
            <CardHeader className="space-y-6">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-full px-4 py-1 text-xs uppercase tracking-[0.22em]">
                      Public report
                    </Badge>
                    {currentRun ? (
                      <Badge className="rounded-full px-4 py-1 text-xs uppercase tracking-[0.22em]" variant="outline">
                        Run {currentRun.status.replaceAll("_", " ")}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="space-y-3">
                    <h1 className="text-balance text-4xl leading-tight text-primary sm:text-5xl">
                      {document.report.companyName
                        ? `${document.report.companyName} account plan`
                        : `${document.report.canonicalDomain} account plan`}
                    </h1>
                    <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-[1.05rem]">
                      {document.result.state === "partial"
                        ? document.result.summary
                        : accountPlan
                        ? `The current run produced ${accountPlan.candidateUseCases.length} candidate use cases, a ${formatMotionLabel(accountPlan.overallAccountMotion.recommendedMotion)} account motion recommendation, and source-backed discovery guidance.`
                        : currentRun?.status === "failed"
                          ? "The latest run failed before the full account plan was generated. Any visible evidence below reflects only the portions that completed."
                          : "This run is still gathering and synthesizing public evidence. Completed sections appear here as soon as they are persisted."}
                    </p>
                  </div>
                </div>
                <div className="rounded-[1.75rem] border border-border/70 bg-background/80 px-5 py-4 text-sm text-muted-foreground">
                  <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Report metadata
                  </div>
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="font-medium text-foreground">Share ID</div>
                      <div className="mt-1 font-mono text-xs">{document.report.shareId}</div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Target</div>
                      <div className="mt-1 break-all text-xs">{document.report.normalizedInputUrl}</div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Created</div>
                      <div className="mt-1 text-xs">{formatDateTime(document.report.createdAt)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Recommended motion
                  </div>
                  <div className="mt-2 font-medium text-foreground">{motionRecommendation}</div>
                </div>
                <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Research completeness
                  </div>
                  <div className="mt-2 font-medium text-foreground">
                    {researchCompleteness !== null ? `${researchCompleteness}/100` : "Pending"}
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Sections ready
                  </div>
                  <div className="mt-2 font-medium text-foreground">
                    {readySectionCount} of {document.sections.length}
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-border/70 bg-background/80 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Sources in registry
                  </div>
                  <div className="mt-2 font-medium text-foreground">{document.sources.length}</div>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-[1.75rem] border border-border/70 bg-gradient-to-br from-background/85 via-white to-secondary/35 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      Export artifacts
                    </div>
                    <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                      Markdown and PDF exports are generated from the persisted report model so they stay aligned with
                      the public web view and source registry.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {markdownArtifact ? (
                      <Button type="button" size="sm" asChild>
                        <a href={markdownArtifact.downloadPath}>
                          <Download className="h-4 w-4" />
                          Download Markdown
                        </a>
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" disabled>
                        <Download className="h-4 w-4" />
                        Markdown {currentRun?.status === "completed" ? "unavailable" : "pending"}
                      </Button>
                    )}
                    {pdfArtifact ? (
                      <Button type="button" size="sm" variant="outline" asChild>
                        <a href={pdfArtifact.downloadPath}>
                          <Download className="h-4 w-4" />
                          Download PDF
                        </a>
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" disabled>
                        <Download className="h-4 w-4" />
                        PDF {currentRun?.status === "completed" ? "unavailable" : "pending"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <a
                    href={document.report.normalizedInputUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-4 py-2 transition hover:border-primary/30 hover:text-primary"
                  >
                    <Link2 className="h-4 w-4 text-primary" />
                    {document.report.normalizedInputUrl}
                  </a>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-4 py-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Created {formatDateTime(document.report.createdAt)}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-4 py-2">
                    <LayoutList className="h-4 w-4 text-primary" />
                    {readySectionCount} of {document.sections.length} sections ready
                  </div>
                </div>
              </div>

              {currentRun?.status === "completed" && markdownArtifact && !pdfArtifact ? (
                <p className="text-sm leading-7 text-muted-foreground">
                  PDF export is unavailable for this run. The Markdown export and cited web report remain available.
                </p>
              ) : null}
            </CardHeader>
          </Card>

          <nav
            aria-label="Report sections"
            className="sticky top-[5rem] z-20 overflow-x-auto rounded-[1.75rem] border border-white/80 bg-white/88 px-3 py-3 shadow-panel backdrop-blur-xl"
          >
            <div className="flex min-w-max items-center justify-between gap-3">
              <div className="hidden items-center gap-3 pl-2 sm:flex">
                <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Jump to
                </span>
              </div>
              <div className="flex min-w-max items-center gap-2">
                {reportAnchorItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="rounded-full px-4 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-secondary-foreground"
                  >
                    {item.label}
                  </a>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="xl:hidden"
                  onClick={() => setIsMobileSourcePanelOpen(true)}
                >
                  <BookOpenText className="h-4 w-4" />
                  Sources
                </Button>
              </div>
            </div>
          </nav>

          <ReportStatusPanel status={status} isPolling={isPolling} errorMessage={errorMessage} />

          {currentRun?.status === "failed" ? (
            <Card className="border-destructive/20 bg-destructive/5 shadow-panel">
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-medium text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    Report generation failed
                  </div>
                  <p className="max-w-2xl text-sm leading-7 text-destructive">
                    {currentRun.errorMessage ?? currentRun.statusMessage}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href={retryHref}>
                      <RefreshCcw className="h-3.5 w-3.5" />
                      Start a fresh run
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {documentError ? (
            <div className="rounded-[1.75rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {documentError}
            </div>
          ) : null}

          <ReportSection
            id="overview"
            eyebrow="Overview"
            title="Account posture"
            description="A grounded summary of what the current evidence supports, where confidence is thinner, and how the overall motion recommendation should be interpreted."
          >
            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Card className="border-white/70 bg-white/80 shadow-panel">
                <CardHeader className="space-y-3">
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Target className="h-5 w-5 text-primary" />
                    Overall motion
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge className="rounded-full px-4 py-1.5 uppercase" variant="secondary">
                      {accountPlan ? formatMotionLabel(accountPlan.overallAccountMotion.recommendedMotion) : "Pending"}
                    </Badge>
                    {researchSummary ? (
                      <span className={cn("text-sm font-medium", confidenceTone(researchSummary.researchCompletenessScore))}>
                        Completeness {researchSummary.researchCompletenessScore}/100
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {accountPlan?.overallAccountMotion.rationale ??
                      "The motion recommendation will appear once the planning stage has enough evidence to choose between workspace, API platform, or hybrid."}
                  </p>
                  {accountPlan ? (
                    <EvidencePills
                      sourceIds={accountPlan.overallAccountMotion.evidenceSourceIds}
                      sources={document.sources}
                      onSelectSources={handleSelectSources}
                    />
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-white/70 bg-white/80 shadow-panel">
                <CardHeader className="space-y-3">
                  <CardTitle className="text-2xl">Company identity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <div>
                    <div className="font-medium text-foreground">
                      {researchSummary?.companyIdentity.companyName ?? document.report.companyName ?? document.report.canonicalDomain}
                    </div>
                    <div>{researchSummary?.companyIdentity.archetype ?? "Identity resolution pending"}</div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-3xl border border-border/70 bg-background/75 p-3">
                      <div className="font-medium text-foreground">AI maturity</div>
                      <div className="mt-1">
                        {researchSummary?.aiMaturityEstimate.level ?? "Not scored yet"}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-border/70 bg-background/75 p-3">
                      <div className="font-medium text-foreground">Regulatory sensitivity</div>
                      <div className="mt-1">
                        {researchSummary?.regulatorySensitivity.level ?? "Not scored yet"}
                      </div>
                    </div>
                  </div>
                  {researchSummary ? (
                    <EvidencePills
                      sourceIds={researchSummary.companyIdentity.sourceIds}
                      sources={document.sources}
                      onSelectSources={handleSelectSources}
                    />
                  ) : null}
                </CardContent>
              </Card>
            </div>

            {document.thinEvidenceWarnings.length > 0 ? (
              <div className="grid gap-3">
                {document.thinEvidenceWarnings.map((warning) => (
                  <Card
                    key={warning.id}
                    className={cn(
                      "shadow-none",
                      warning.level === "warning"
                        ? "border-amber-200 bg-amber-50"
                        : "border-sky-200 bg-sky-50",
                    )}
                  >
                    <CardContent className="space-y-3 p-5 text-sm leading-7">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <ShieldAlert className="h-4 w-4 text-primary" />
                        {warning.title}
                      </div>
                      <p className="text-muted-foreground">{warning.message}</p>
                      {warning.sourceIds.length > 0 ? (
                        <EvidencePills
                          sourceIds={warning.sourceIds}
                          sources={document.sources}
                          onSelectSources={handleSelectSources}
                        />
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {document.sectionAssessments.map((section) => (
                <Card key={section.key} className="border-white/70 bg-white/75 shadow-none">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">{section.label}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          {section.completenessLabel}
                        </div>
                      </div>
                      <Badge className="rounded-full px-3 py-1" variant={section.status === "ready" ? "secondary" : "outline"}>
                        {section.confidence !== null ? `${section.confidence}/100` : "Pending"}
                      </Badge>
                    </div>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {section.confidenceRationale ?? "Section confidence will be scored once evidence reaches this part of the report."}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ReportSection>

          <ReportSection
            id="research"
            eyebrow="Research"
            title="Source-backed public signals"
            description="Public company and external signals are summarized here with explicit citations and a visible split between facts, inferences, and hypotheses."
          >
            {researchSummary ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-white/70 bg-white/80 shadow-none">
                  <CardHeader>
                    <CardTitle className="text-xl">Growth priorities</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {researchSummary.growthPriorities.length > 0 ? (
                      researchSummary.growthPriorities.map((item, index) => (
                        <div key={`${item.summary}-${index}`} className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <p className="text-sm leading-7 text-muted-foreground">{item.summary}</p>
                          <div className="mt-3">
                            <EvidencePills
                              sourceIds={item.sourceIds}
                              sources={document.sources}
                              onSelectSources={handleSelectSources}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptySection
                        title="Growth priorities pending"
                        description="External enrichment has not yet surfaced confident growth signals."
                      />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-white/70 bg-white/80 shadow-none">
                  <CardHeader>
                    <CardTitle className="text-xl">Signal summary</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {[
                      {
                        label: "AI maturity",
                        value: `${researchSummary.aiMaturityEstimate.level}: ${researchSummary.aiMaturityEstimate.rationale}`,
                        sourceIds: researchSummary.aiMaturityEstimate.sourceIds,
                      },
                      {
                        label: "Regulatory sensitivity",
                        value: `${researchSummary.regulatorySensitivity.level}: ${researchSummary.regulatorySensitivity.rationale}`,
                        sourceIds: researchSummary.regulatorySensitivity.sourceIds,
                      },
                    ].map((item) => (
                      <div key={item.label} className="rounded-3xl border border-border/70 bg-background/70 p-4">
                        <div className="font-medium text-foreground">{item.label}</div>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.value}</p>
                        <div className="mt-3">
                          <EvidencePills
                            sourceIds={item.sourceIds}
                            sources={document.sources}
                            onSelectSources={handleSelectSources}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {[
                  { title: "Product signals", items: researchSummary.notableProductSignals },
                  { title: "Hiring signals", items: researchSummary.notableHiringSignals },
                  { title: "Trust signals", items: researchSummary.notableTrustSignals },
                  { title: "Complaint themes", items: researchSummary.complaintThemes },
                  { title: "Leadership and social themes", items: researchSummary.leadershipSocialThemes },
                ].map((group) => (
                  <Card key={group.title} className="border-white/70 bg-white/80 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-xl">{group.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {group.items.length > 0 ? (
                        group.items.map((item, index) => (
                          <div key={`${group.title}-${index}`} className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <p className="text-sm leading-7 text-muted-foreground">{item.summary}</p>
                            <div className="mt-3">
                              <EvidencePills
                                sourceIds={item.sourceIds}
                                sources={document.sources}
                                onSelectSources={handleSelectSources}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptySection
                          title={`${group.title} not established yet`}
                          description="Available public evidence did not support a confident summary for this signal cluster."
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptySection
                title="Research summary pending"
                description="This section will populate once the run completes external enrichment and fact-base synthesis."
              />
            )}

            <Card className="border-white/70 bg-white/80 shadow-none">
              <CardHeader>
                <CardTitle className="text-2xl">Fact base</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {document.facts.length > 0 ? (
                  document.facts.map((fact) => (
                    <div key={fact.id} className="rounded-3xl border border-border/70 bg-background/70 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em]",
                            classificationBadgeClass(fact.classification),
                          )}
                        >
                          {fact.classification}
                        </span>
                        <Badge variant="outline" className="rounded-full px-3 py-1">
                          {fact.confidence}/100 confidence
                        </Badge>
                        <Badge variant="outline" className="rounded-full px-3 py-1 capitalize">
                          {fact.freshness}
                        </Badge>
                      </div>
                      <p className="mt-3 text-base leading-7 text-foreground">{fact.statement}</p>
                      {fact.rationale ? (
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{fact.rationale}</p>
                      ) : null}
                      {fact.evidenceSnippet ? (
                        <div className="mt-3 rounded-3xl border border-border/70 bg-white/80 p-4 text-sm leading-7 text-muted-foreground">
                          {fact.evidenceSnippet}
                        </div>
                      ) : null}
                      <div className="mt-3">
                        <EvidencePills
                          sourceIds={fact.sourceIds}
                          sources={document.sources}
                          onSelectSources={handleSelectSources}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptySection
                    title="Fact base pending"
                    description="Claims will appear here once the run has normalized source-backed facts and labeled them as facts, inferences, or hypotheses."
                  />
                )}
              </CardContent>
            </Card>
          </ReportSection>

          <ReportSection
            id="use-cases"
            eyebrow="Use Cases"
            title="Prioritized AI opportunities"
            description="Candidate use cases are scored with explicit components so the ranking is explainable rather than opaque."
          >
            {accountPlan ? (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  {accountPlan.topUseCases.map((useCase) => (
                    <Card key={`top-${useCase.workflowName}`} className="border-white/70 bg-white/85 shadow-panel">
                      <CardHeader className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant="secondary" className="rounded-full px-3 py-1">
                            Top {useCase.priorityRank}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            {useCase.scorecard.priorityScore}
                          </Badge>
                        </div>
                        <CardTitle className="text-xl">{useCase.workflowName}</CardTitle>
                        <p className="text-sm text-muted-foreground">{formatDepartmentLabel(useCase.department)}</p>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                        <p>{useCase.summary}</p>
                        <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">Expected outcome</div>
                          <p className="mt-2">{useCase.expectedOutcome}</p>
                        </div>
                        <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">Why now</div>
                          <p className="mt-2">{useCase.whyNow}</p>
                        </div>
                        <EvidencePills
                          sourceIds={useCase.evidenceSourceIds}
                          sources={document.sources}
                          onSelectSources={handleSelectSources}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {accountPlan.candidateUseCases.map((useCase) => (
                    <Card key={useCase.workflowName} className="border-white/70 bg-white/80 shadow-none">
                      <CardHeader className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              Rank {useCase.priorityRank} · {formatDepartmentLabel(useCase.department)}
                            </div>
                            <CardTitle className="text-xl">{useCase.workflowName}</CardTitle>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary" className="rounded-full px-3 py-1">
                              {formatMotionLabel(useCase.recommendedMotion)}
                            </Badge>
                            <Badge variant="outline" className="rounded-full px-3 py-1">
                              {useCase.scorecard.priorityScore}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                        <p>{useCase.summary}</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Pain point</div>
                            <p className="mt-2">{useCase.painPoint}</p>
                          </div>
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Why now</div>
                            <p className="mt-2">{useCase.whyNow}</p>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">Expected outcome</div>
                          <p className="mt-2">{useCase.expectedOutcome}</p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Likely users</div>
                            <ul className="mt-2 space-y-1">
                              {useCase.likelyUsers.map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Metrics</div>
                            <ul className="mt-2 space-y-1">
                              {useCase.metrics.map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Dependencies</div>
                            {useCase.dependencies.length > 0 ? (
                              <ul className="mt-2 space-y-1">
                                {useCase.dependencies.map((item) => (
                                  <li key={item}>• {item}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2">No major dependencies identified in public evidence.</p>
                            )}
                          </div>
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Security and compliance notes</div>
                            {useCase.securityComplianceNotes.length > 0 ? (
                              <ul className="mt-2 space-y-1">
                                {useCase.securityComplianceNotes.map((item) => (
                                  <li key={item}>• {item}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2">No additional notes were supported by public evidence.</p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">Motion rationale</div>
                          <p className="mt-2">{useCase.motionRationale}</p>
                        </div>

                        <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">Score breakdown</div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {[
                              ["Business value", useCase.scorecard.businessValue],
                              ["Deployment readiness", useCase.scorecard.deploymentReadiness],
                              ["Expansion potential", useCase.scorecard.expansionPotential],
                              ["OpenAI fit", useCase.scorecard.openaiFit],
                              ["Sponsor likelihood", useCase.scorecard.sponsorLikelihood],
                              ["Evidence confidence", useCase.scorecard.evidenceConfidence],
                              ["Risk penalty", useCase.scorecard.riskPenalty],
                              ["Priority score", useCase.scorecard.priorityScore],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-2xl border border-border/70 bg-white px-3 py-2">
                                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
                                <div className="mt-1 font-medium text-foreground">{value}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">Open questions</div>
                          <ul className="mt-2 space-y-1">
                            {useCase.openQuestions.map((item) => (
                              <li key={item}>• {item}</li>
                            ))}
                          </ul>
                        </div>

                        <EvidencePills
                          sourceIds={useCase.evidenceSourceIds}
                          sources={document.sources}
                          onSelectSources={handleSelectSources}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <EmptySection
                title="Use-case scoring pending"
                description="The planning stage has not yet produced the ranked candidate list, motion recommendation, and pilot packaging."
              />
            )}
          </ReportSection>

          <ReportSection
            id="stakeholders"
            eyebrow="Stakeholders"
            title="Likely sponsors, objections, and discovery paths"
            description="Stakeholder entries remain explicit hypotheses until direct account discovery confirms them."
          >
            {accountPlan ? (
              <div className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-3">
                  {accountPlan.stakeholderHypotheses.map((stakeholder) => (
                    <Card key={`${stakeholder.likelyRole}-${stakeholder.hypothesis}`} className="border-white/70 bg-white/80 shadow-none">
                      <CardHeader className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          {stakeholder.department ?? "Cross-functional"}
                        </div>
                        <CardTitle className="text-xl">{stakeholder.likelyRole}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                        <p>{stakeholder.hypothesis}</p>
                        <p>{stakeholder.rationale}</p>
                        <Badge variant="outline" className="rounded-full px-3 py-1">
                          {stakeholder.confidence}/100 confidence
                        </Badge>
                        <EvidencePills
                          sourceIds={stakeholder.evidenceSourceIds}
                          sources={document.sources}
                          onSelectSources={handleSelectSources}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="border-white/70 bg-white/80 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-xl">Likely objections and rebuttals</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {accountPlan.objectionsAndRebuttals.map((item) => (
                        <div key={item.objection} className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">{item.objection}</div>
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.rebuttal}</p>
                          <div className="mt-3">
                            <EvidencePills
                              sourceIds={item.evidenceSourceIds}
                              sources={document.sources}
                              onSelectSources={handleSelectSources}
                            />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-white/70 bg-white/80 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-xl">Discovery questions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {accountPlan.discoveryQuestions.map((item) => (
                        <div key={item.question} className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">{item.question}</div>
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.whyItMatters}</p>
                          <div className="mt-3">
                            <EvidencePills
                              sourceIds={item.evidenceSourceIds}
                              sources={document.sources}
                              onSelectSources={handleSelectSources}
                            />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <EmptySection
                title="Stakeholder hypotheses pending"
                description="This section will populate once account planning has enough evidence to frame likely sponsors, objections, and discovery gaps."
              />
            )}
          </ReportSection>

          <ReportSection
            id="pilot-plan"
            eyebrow="Pilot Plan"
            title="90-day pilot structure"
            description="The pilot plan stays conservative when evidence is thin and expands only after the highest-confidence workflow proves value."
          >
            {accountPlan ? (
              <div className="space-y-4">
                <Card className="border-white/70 bg-white/85 shadow-panel">
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="text-2xl">Pilot recommendation</CardTitle>
                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                        {formatMotionLabel(accountPlan.pilotPlan.recommendedMotion)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                        <div className="font-medium text-foreground">Objective</div>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{accountPlan.pilotPlan.objective}</p>
                      </div>
                      <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                        <div className="font-medium text-foreground">Scope</div>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{accountPlan.pilotPlan.scope}</p>
                      </div>
                      <EvidencePills
                        sourceIds={accountPlan.pilotPlan.evidenceSourceIds}
                        sources={document.sources}
                        onSelectSources={handleSelectSources}
                      />
                    </div>
                    <div className="grid gap-3">
                      <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                        <div className="font-medium text-foreground">Success metrics</div>
                        <ul className="mt-2 space-y-1 text-sm leading-7 text-muted-foreground">
                          {accountPlan.pilotPlan.successMetrics.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                        <div className="font-medium text-foreground">Dependencies</div>
                        <ul className="mt-2 space-y-1 text-sm leading-7 text-muted-foreground">
                          {accountPlan.pilotPlan.dependencies.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                        <div className="font-medium text-foreground">Risks</div>
                        <ul className="mt-2 space-y-1 text-sm leading-7 text-muted-foreground">
                          {accountPlan.pilotPlan.risks.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-3">
                  {accountPlan.pilotPlan.phases.map((phase) => (
                    <Card key={phase.name} className="border-white/70 bg-white/80 shadow-none">
                      <CardHeader className="space-y-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{phase.duration}</div>
                        <CardTitle className="text-xl">{phase.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground">
                        <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">Goals</div>
                          <ul className="mt-2 space-y-1">
                            {phase.goals.map((item) => (
                              <li key={item}>• {item}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">Deliverables</div>
                          <ul className="mt-2 space-y-1">
                            {phase.deliverables.map((item) => (
                              <li key={item}>• {item}</li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <EmptySection
                title="Pilot plan pending"
                description="The 90-day pilot structure will appear once the run has selected the highest-confidence workflows and motion recommendation."
              />
            )}
          </ReportSection>

          <ReportSection
            id="expansion-scenarios"
            eyebrow="Expansion Scenarios"
            title="Low, base, and high paths"
            description="Scenario planning stays tied to explicit assumptions so the report does not imply certainty where the evidence does not support it."
          >
            {accountPlan ? (
              <div className="grid gap-4 xl:grid-cols-3">
                {[
                  { label: "Low case", scenario: accountPlan.expansionScenarios.low },
                  { label: "Base case", scenario: accountPlan.expansionScenarios.base },
                  { label: "High case", scenario: accountPlan.expansionScenarios.high },
                ].map(({ label, scenario }) => (
                  <Card key={label} className="border-white/70 bg-white/80 shadow-none">
                    <CardHeader>
                      <CardTitle className="text-xl">{label}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                      <p>{scenario.summary}</p>
                      <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                        <div className="font-medium text-foreground">Assumptions</div>
                        <ul className="mt-2 space-y-1">
                          {scenario.assumptions.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                        <div className="font-medium text-foreground">Expected outcomes</div>
                        <ul className="mt-2 space-y-1">
                          {scenario.expectedOutcomes.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                      <EvidencePills
                        sourceIds={scenario.evidenceSourceIds}
                        sources={document.sources}
                        onSelectSources={handleSelectSources}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptySection
                title="Expansion scenarios pending"
                description="This section will appear once the planning stage has enough evidence to describe low, base, and high adoption paths."
              />
            )}
          </ReportSection>

          <ReportSection
            id="sources"
            eyebrow="Sources"
            title="Full source registry"
            description="Every citation in the report resolves to a persisted source from this run. If a source does not exist here, the report should not treat it as evidence."
          >
            {document.sources.length > 0 ? (
              <div className="grid gap-4">
                {document.sources.map((source) => (
                  <Card key={source.id} className="border-white/70 bg-white/80 shadow-none">
                    <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="rounded-full px-3 py-1">
                            Source {source.id}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-3 py-1 capitalize">
                            {formatSourceTypeLabel(source.sourceType)}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            {source.sourceTier}
                          </Badge>
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{source.title}</div>
                          <div className="mt-1 break-all text-sm text-muted-foreground">{source.url}</div>
                        </div>
                        <p className="text-sm leading-7 text-muted-foreground">
                          {source.summary ?? "No normalized source summary is available yet for this item."}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1">
                            Domain: {source.canonicalDomain}
                          </span>
                          {source.publishedAt ? (
                            <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1">
                              Published {formatDateTime(source.publishedAt)}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1">
                            Discovered {formatDateTime(source.discoveredAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleSelectSources([source.id])}>
                          <BookOpenText className="h-3.5 w-3.5" />
                          Inspect
                        </Button>
                        <Button type="button" variant="outline" size="sm" asChild>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptySection
                title="Sources pending"
                description="Source records will appear here once the crawl and enrichment steps have persisted usable evidence."
              />
            )}
          </ReportSection>

          {!canShowCompletedReport ? (
            <Card className="border-white/80 bg-white/82 shadow-none">
              <CardContent className="p-5 text-sm leading-7 text-muted-foreground">
                The report is still building. Stay on this page to follow the live pipeline, or come back later using
                the same public share link and recent reports list.
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="hidden xl:block">
          <div className="sticky top-28">
            <ReportSourcePanel sources={document.sources} selectedSourceIds={selectedSourceIds} />
          </div>
        </div>
      </Container>

      {isMobileSourcePanelOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setIsMobileSourcePanelOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[2rem] bg-background p-4">
            <ReportSourcePanel
              sources={document.sources}
              selectedSourceIds={selectedSourceIds}
              onClose={() => setIsMobileSourcePanelOpen(false)}
              showCloseButton
            />
          </div>
        </div>
      ) : null}
    </SectionFrame>
  );
}
