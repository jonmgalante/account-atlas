"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpenText,
  Download,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCcw,
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
import {
  buildCanonicalOpportunityScorecard,
  canonicalCitationSourceIds,
  getDisplaySourceId,
  hasCanonicalExpansionScenario,
  isCanonicalGroundedFallbackReport,
} from "@/lib/canonical-report";
import { formatDateTime } from "@/lib/date";
import { addRecentReport } from "@/lib/recent-reports";
import type { ApiResponse } from "@/lib/types/api";
import type {
  ReportDocument,
  ReportFactRecord,
  ReportSectionKey,
  ReportRunSummary,
  ReportStatusShell,
} from "@/lib/types/report";
import { cn } from "@/lib/utils";

type ReportExperienceProps = {
  shareId: string;
  initialDocument: ReportDocument;
  initialStatus: ReportStatusShell | null;
};

type CanonicalOpportunity = NonNullable<NonNullable<ReportRunSummary["canonicalReport"]>["top_opportunities"]>[number];
type LegacyOpportunity = NonNullable<NonNullable<ReportRunSummary["accountPlan"]>["candidateUseCases"]>[number];
type RenderableOpportunity = CanonicalOpportunity | LegacyOpportunity;
type CanonicalStakeholder =
  NonNullable<NonNullable<ReportRunSummary["canonicalReport"]>["buying_map"]["stakeholder_hypotheses"]>[number];
type LegacyStakeholder = NonNullable<NonNullable<ReportRunSummary["accountPlan"]>["stakeholderHypotheses"]>[number];
type RenderableStakeholder = CanonicalStakeholder | LegacyStakeholder;
type CanonicalObjection =
  NonNullable<NonNullable<ReportRunSummary["canonicalReport"]>["buying_map"]["likely_objections"]>[number];
type LegacyObjection = NonNullable<NonNullable<ReportRunSummary["accountPlan"]>["objectionsAndRebuttals"]>[number];
type RenderableObjection = CanonicalObjection | LegacyObjection;
type CanonicalDiscoveryQuestion =
  NonNullable<NonNullable<ReportRunSummary["canonicalReport"]>["buying_map"]["discovery_questions"]>[number];
type LegacyDiscoveryQuestion = NonNullable<NonNullable<ReportRunSummary["accountPlan"]>["discoveryQuestions"]>[number];
type RenderableDiscoveryQuestion = CanonicalDiscoveryQuestion | LegacyDiscoveryQuestion;

type ReportMode = "brief" | "evidence" | "build";

const primaryReportModes: ReadonlyArray<{
  id: ReportMode;
  label: string;
}> = [
  { id: "brief", label: "Brief" },
  { id: "evidence", label: "Evidence" },
] as const;

const reportAnchorItemsByMode: Record<
  ReportMode,
  ReadonlyArray<{
    id: string;
    label: string;
  }>
> = {
  brief: [
    { id: "overview", label: "Executive summary" },
    { id: "use-cases", label: "Top opportunities" },
    { id: "stakeholders", label: "Buying map" },
    { id: "pilot-plan", label: "90-day pilot" },
    { id: "expansion-scenarios", label: "Expansion" },
  ],
  evidence: [
    { id: "research", label: "Research" },
    { id: "sources", label: "Sources" },
  ],
  build: [{ id: "build-details", label: "Details" }],
};

const reportModeByAnchorId: Record<string, ReportMode> = {
  overview: "brief",
  "use-cases": "brief",
  stakeholders: "brief",
  "pilot-plan": "brief",
  "expansion-scenarios": "brief",
  research: "evidence",
  sources: "evidence",
  "build-details": "build",
};

const compactSectionGroups: ReadonlyArray<{
  id: "research" | "use-cases" | "stakeholders" | "pilot-plan" | "expansion-scenarios";
  label: string;
  keys: readonly ReportSectionKey[];
  pendingDescription: string;
}> = [
  {
    id: "research",
    label: "Research",
    keys: ["company-brief", "fact-base", "ai-maturity-signals"],
    pendingDescription: "Public-web signals and fact base appear here as soon as evidence is ready.",
  },
  {
    id: "use-cases",
    label: "Top opportunities",
    keys: ["prioritized-use-cases", "recommended-motion"],
    pendingDescription: "Ranked opportunities and motion fit will appear here once planning has enough evidence.",
  },
  {
    id: "stakeholders",
    label: "Buying map",
    keys: ["stakeholder-hypotheses", "objections", "discovery-questions"],
    pendingDescription: "Likely sponsors, objections, and discovery paths appear here once planning is ready.",
  },
  {
    id: "pilot-plan",
    label: "90-day pilot",
    keys: ["pilot-plan"],
    pendingDescription: "The pilot structure appears here once the top opportunity and motion are ready.",
  },
  {
    id: "expansion-scenarios",
    label: "Expansion",
    keys: ["expansion-scenarios"],
    pendingDescription: "Scenario planning appears here after the brief has enough evidence to frame adoption paths.",
  },
] as const;

const reportSectionDescriptionClass = "max-w-2xl text-sm leading-6 text-foreground/70 sm:text-base sm:leading-7";
const reportBodyTextClass =
  "text-sm text-muted-foreground [&_li]:leading-6 [&_p]:leading-6 sm:[&_li]:leading-7 sm:[&_p]:leading-7";
const reportCardFlowClass = `space-y-4 ${reportBodyTextClass}`;
const reportCardFlowCompactClass = `space-y-3.5 ${reportBodyTextClass}`;

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

function getRenderableOpportunity(useCase: RenderableOpportunity) {
  const scorecard = "scorecard" in useCase ? useCase.scorecard : buildCanonicalOpportunityScorecard(useCase);

  return {
    key: "workflow_name" in useCase ? useCase.workflow_name : useCase.workflowName,
    priorityRank: "priority_rank" in useCase ? useCase.priority_rank : useCase.priorityRank,
    department: useCase.department,
    workflowName: "workflow_name" in useCase ? useCase.workflow_name : useCase.workflowName,
    summary: useCase.summary,
    painPoint: "pain_point" in useCase ? useCase.pain_point : useCase.painPoint,
    whyNow: "why_now" in useCase ? useCase.why_now : useCase.whyNow,
    likelyUsers: "likely_users" in useCase ? useCase.likely_users : useCase.likelyUsers,
    expectedOutcome: "expected_outcome" in useCase ? useCase.expected_outcome : useCase.expectedOutcome,
    metrics: "success_metrics" in useCase ? useCase.success_metrics : useCase.metrics,
    dependencies: useCase.dependencies,
    securityComplianceNotes:
      "security_compliance_notes" in useCase ? useCase.security_compliance_notes : useCase.securityComplianceNotes,
    recommendedMotion:
      "recommended_motion" in useCase ? useCase.recommended_motion : useCase.recommendedMotion,
    motionRationale: "motion_rationale" in useCase ? useCase.motion_rationale : useCase.motionRationale,
    openQuestions: "open_questions" in useCase ? useCase.open_questions : useCase.openQuestions,
    sourceIds: "citations" in useCase ? canonicalCitationSourceIds(useCase.citations) : useCase.evidenceSourceIds,
    scorecard,
  };
}

function getRenderableStakeholder(stakeholder: RenderableStakeholder) {
  const confidence =
    "citations" in stakeholder
      ? stakeholder.confidence.confidence_score
      : stakeholder.confidence;

  return {
    key: "likely_role" in stakeholder ? stakeholder.likely_role : stakeholder.likelyRole,
    likelyRole: "likely_role" in stakeholder ? stakeholder.likely_role : stakeholder.likelyRole,
    department: stakeholder.department,
    hypothesis: stakeholder.hypothesis,
    rationale: stakeholder.rationale,
    confidence,
    sourceIds: "citations" in stakeholder ? canonicalCitationSourceIds(stakeholder.citations) : stakeholder.evidenceSourceIds,
  };
}

function getRenderableObjection(item: RenderableObjection) {
  return {
    key: item.objection,
    objection: item.objection,
    rebuttal: item.rebuttal,
    sourceIds: "citations" in item ? canonicalCitationSourceIds(item.citations) : item.evidenceSourceIds,
  };
}

function getRenderableDiscoveryQuestion(item: RenderableDiscoveryQuestion) {
  return {
    key: item.question,
    question: item.question,
    whyItMatters: "why_it_matters" in item ? item.why_it_matters : item.whyItMatters,
    sourceIds: "citations" in item ? canonicalCitationSourceIds(item.citations) : item.evidenceSourceIds,
  };
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

function formatReportStatusLabel(status: string, researchCompletenessScore: number | null = null) {
  switch (status) {
    case "queued":
      return "In progress";
    case "running":
      return "In progress";
    case "ready":
      return "Ready";
    case "ready_with_limited_coverage":
      return researchCompletenessScore !== null && researchCompletenessScore >= 75
        ? "Ready with focused coverage"
        : "Ready with limited coverage";
    case "failed":
      return "Failed";
    default:
      return status.replaceAll("_", " ");
  }
}

function formatHeroStatusLabel(status: string) {
  if (status === "ready" || status === "ready_with_limited_coverage") {
    return "Report ready";
  }

  return formatReportStatusLabel(status);
}

function formatDisplayStatusLabel(status: ReportRunSummary["displayStatus"] | ReportStatusShell["displayStatus"]) {
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
      return "Building report";
  }
}

function getExportButtonState(input: {
  artifactDownloadPath: string | null;
  artifactType: "markdown" | "pdf";
  shareId: string;
  isTerminalReport: boolean;
  run: ReportRunSummary | null;
}) {
  const exportLabel = input.artifactType === "pdf" ? "PDF" : "Markdown";
  const canGenerateOnDemand =
    input.isTerminalReport &&
    Boolean(input.run) &&
    (input.run?.displayStatus === "completed" || input.run?.displayStatus === "completed_with_grounded_fallback");

  if (input.artifactDownloadPath) {
    return {
      disabled: false,
      href: input.artifactDownloadPath,
      label: `Download ${exportLabel}`,
    };
  }

  if (canGenerateOnDemand) {
    return {
      disabled: false,
      href: `/api/reports/${input.shareId}/artifacts/${input.artifactType}`,
      label: `Prepare ${exportLabel}`,
    };
  }

  return {
    disabled: true,
    href: null,
    label: `${exportLabel} pending`,
  };
}

function hasDownloadableArtifact(
  artifacts: ReportDocument["artifacts"],
  artifactType: "markdown" | "pdf",
) {
  return artifacts.some(
    (artifact) => artifact.artifactType === artifactType && typeof artifact.downloadPath === "string",
  );
}

async function fetchReportDocument(shareId: string) {
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

  return payload.data;
}

function getHeroSummary({
  isBuildingReport,
  hasReadySections,
  currentRunStatus,
}: {
  isBuildingReport: boolean;
  hasReadySections: boolean;
  currentRunStatus: string | null;
}) {
  if (isBuildingReport) {
    return "Seller-first brief built from public-web evidence. The saved brief will appear here as soon as it is ready.";
  }

  if (currentRunStatus === "failed" && !hasReadySections) {
    return "Seller-first brief built from public-web evidence, but this run ended before a usable brief was ready.";
  }

  return "Seller-first brief built from public-web evidence, with sources, confidence, and uncertainty kept visible.";
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

function EmptySection({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <Card
      className={cn(
        "border-dashed shadow-none",
        compact
          ? "border-border/50 bg-background/65"
          : "border-border/70 bg-gradient-to-br from-muted/85 via-muted/65 to-card/65",
      )}
    >
      <CardContent className={cn("text-sm leading-6 text-foreground/70", compact ? "p-4" : "p-5")}>
        <div
          className={cn(
            "text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground",
            compact && "inline-flex items-center gap-1.5",
          )}
        >
          {compact ? (
            <>
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />
              In progress
            </>
          ) : (
            "Waiting on evidence"
          )}
        </div>
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
    <section id={id} className="scroll-mt-32 space-y-6 border-t border-border/60 pt-8 sm:pt-9">
      <div className="space-y-3">
        <div className="h-px w-16 bg-gradient-to-r from-primary/40 to-transparent" />
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">{eyebrow}</p>
        <div className="space-y-2.5">
          <h2 className="text-3xl leading-tight text-primary sm:text-4xl">{title}</h2>
          <p className={reportSectionDescriptionClass}>{description}</p>
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
  const [reportMode, setReportMode] = useState<ReportMode>("brief");
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);
  const [isMobileSourcePanelOpen, setIsMobileSourcePanelOpen] = useState(false);
  const [isExpansionOpen, setIsExpansionOpen] = useState(false);

  useEffect(() => {
    const syncModeFromHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      const nextMode = reportModeByAnchorId[hash];

      if (nextMode) {
        setReportMode(nextMode);
      }

      if (hash === "expansion-scenarios") {
        setIsExpansionOpen(true);
      }
    };

    syncModeFromHash();
    window.addEventListener("hashchange", syncModeFromHash);

    return () => {
      window.removeEventListener("hashchange", syncModeFromHash);
    };
  }, []);

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
        const payload = await fetchReportDocument(shareId);

        if (cancelled) {
          return;
        }

        setDocument(payload);
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

  const currentRun = document.currentRun;
  const liveRun = status?.isTerminal ? status.currentRun ?? currentRun : status?.currentRun ?? currentRun;
  const canonicalReport = liveRun?.canonicalReport ?? currentRun?.canonicalReport ?? null;
  const researchSummary = currentRun?.researchSummary ?? null;
  const accountPlan = currentRun?.accountPlan ?? null;
  const isGroundedFallbackBrief = canonicalReport
    ? isCanonicalGroundedFallbackReport(canonicalReport)
    : accountPlan?.publishMode === "grounded_fallback";
  const canonicalTopOpportunities = canonicalReport
    ? [...canonicalReport.top_opportunities].sort((left, right) => left.priority_rank - right.priority_rank)
    : [];
  const topUseCaseKeys = new Set(
    accountPlan?.topUseCases.map((useCase) => `${useCase.priorityRank}-${useCase.workflowName}`) ?? [],
  );
  const remainingUseCases = canonicalReport
    ? canonicalTopOpportunities.slice(3)
    : accountPlan?.candidateUseCases.filter(
        (useCase) => !topUseCaseKeys.has(`${useCase.priorityRank}-${useCase.workflowName}`),
      ) ?? [];
  const topOpportunity = canonicalReport
    ? canonicalTopOpportunities[0] ?? null
    : isGroundedFallbackBrief
      ? accountPlan?.topUseCases[0] ?? null
      : accountPlan?.topUseCases[0] ?? accountPlan?.candidateUseCases[0] ?? null;
  const stakeholderHypotheses = canonicalReport?.buying_map.stakeholder_hypotheses ?? accountPlan?.stakeholderHypotheses ?? [];
  const objections = canonicalReport?.buying_map.likely_objections ?? accountPlan?.objectionsAndRebuttals ?? [];
  const discoveryQuestions = canonicalReport?.buying_map.discovery_questions ?? accountPlan?.discoveryQuestions ?? [];
  const pilotPlan = canonicalReport?.pilot_plan ?? accountPlan?.pilotPlan ?? null;
  const expansionScenarios = canonicalReport?.expansion_scenarios ?? accountPlan?.expansionScenarios ?? {
    low: null,
    base: null,
    high: null,
  };
  const executiveSummary = canonicalReport?.executive_summary ?? null;
  const factBase = canonicalReport?.fact_base ?? [];
  const aiMaturitySignals = canonicalReport?.ai_maturity_signals ?? null;
  const markdownArtifact = document.artifacts.find((artifact) => artifact.artifactType === "markdown") ?? null;
  const pdfArtifact = document.artifacts.find((artifact) => artifact.artifactType === "pdf") ?? null;
  const downloadableMarkdownArtifact = markdownArtifact?.downloadPath ? markdownArtifact : null;
  const downloadablePdfArtifact = pdfArtifact?.downloadPath ? pdfArtifact : null;
  const liveReportStatus = status?.report.status ?? document.report.status;
  const liveDisplayStatus = status?.displayStatus ?? liveRun?.displayStatus ?? currentRun?.displayStatus ?? null;
  const readySectionCount = document.sections.filter((section) => section.status === "ready").length;
  const researchCompleteness =
    canonicalReport?.evidence_coverage.research_completeness_score ?? researchSummary?.researchCompletenessScore ?? null;
  const motionRecommendation = canonicalReport
    ? formatMotionLabel(canonicalReport.recommended_motion.recommended_motion)
    : accountPlan
      ? formatMotionLabel(accountPlan.overallAccountMotion.recommendedMotion)
      : "Pending";
  const companyDisplayName =
    canonicalReport?.company.resolved_name ??
    researchSummary?.companyIdentity.companyName ??
    document.report.companyName ??
    document.report.canonicalDomain;
  const primaryStatusLabel = liveDisplayStatus
    ? formatDisplayStatusLabel(liveDisplayStatus)
    : formatReportStatusLabel(liveReportStatus, researchCompleteness);
  const heroStatusLabel =
    liveDisplayStatus && liveDisplayStatus !== "completed"
      ? formatDisplayStatusLabel(liveDisplayStatus)
      : formatHeroStatusLabel(liveReportStatus);
  const isBuildingReport =
    liveDisplayStatus !== null
      ? liveDisplayStatus === "queued" || liveDisplayStatus === "in_progress"
      : liveReportStatus === "queued" || liveReportStatus === "running";
  const hasResearchContent = canonicalReport
    ? Boolean(executiveSummary || aiMaturitySignals || factBase.length > 0)
    : Boolean(researchSummary || document.facts.length > 0);
  const hasPlanningContent = canonicalReport
    ? Boolean(topOpportunity && canonicalReport.recommended_motion.rationale)
    : Boolean(accountPlan && topOpportunity && accountPlan.overallAccountMotion.rationale);
  const hasGroundedHypothesisContent = canonicalReport
    ? Boolean(isGroundedFallbackBrief && canonicalTopOpportunities.length > 0)
    : Boolean(isGroundedFallbackBrief && (accountPlan?.candidateUseCases.length ?? 0) > 0);
  const hasStakeholderContent = Boolean(stakeholderHypotheses.length);
  const hasDiscoveryContent = Boolean(objections.length > 0 || discoveryQuestions.length > 0);
  const hasPilotPlanContent = Boolean(pilotPlan);
  const hasExpansionContent = canonicalReport
    ? hasCanonicalExpansionScenario(canonicalReport)
    : Boolean(accountPlan?.expansionScenarios.low ?? accountPlan?.expansionScenarios.base ?? accountPlan?.expansionScenarios.high);
  const hasSourcesContent = document.sources.length > 0;
  const showResearchSection = !isBuildingReport || hasResearchContent;
  const showUseCasesSection = !isBuildingReport || hasPlanningContent || hasGroundedHypothesisContent;
  const showStakeholdersSection = !isBuildingReport || hasStakeholderContent || hasDiscoveryContent;
  const showPilotPlanSection = !isBuildingReport || hasPilotPlanContent;
  const showExpansionSection = !isBuildingReport || hasExpansionContent;
  const showSourcesSection = !isBuildingReport || hasSourcesContent;
  const sectionStatusByKey = new Map(document.sections.map((section) => [section.key, section.status]));
  const pendingSectionTargets = compactSectionGroups
    .map((section) => {
      const readyCount = section.keys.filter((key) => sectionStatusByKey.get(key) === "ready").length;
      const isVisible =
        section.id === "research"
          ? showResearchSection
          : section.id === "use-cases"
            ? showUseCasesSection
            : section.id === "stakeholders"
              ? showStakeholdersSection
              : section.id === "pilot-plan"
                ? showPilotPlanSection
                : showExpansionSection;

      return {
        ...section,
        readyCount,
        totalCount: section.keys.length,
        isVisible,
      };
    })
    .filter((section) => !section.isVisible);
  const pendingSourceTarget =
    isBuildingReport && !showSourcesSection
      ? {
          id: "sources" as const,
          label: "Sources",
          readyCount: 0,
          totalCount: 1,
          pendingDescription: "Cited sources appear here as evidence is collected.",
        }
      : null;
  const showCompactPendingSections =
    isBuildingReport && (pendingSectionTargets.length > 0 || Boolean(pendingSourceTarget));
  const heroSummary = getHeroSummary({
    isBuildingReport,
    hasReadySections: readySectionCount > 0,
    currentRunStatus: liveRun?.displayStatus ?? currentRun?.status ?? null,
  });
  const activeAnchorItems = reportAnchorItemsByMode[reportMode];
  const activePreparingAnchorIds = new Set<string>();
  if (showUseCasesSection) {
    activePreparingAnchorIds.add("use-cases");
  }
  if (showStakeholdersSection) {
    activePreparingAnchorIds.add("stakeholders");
  }
  if (showPilotPlanSection) {
    activePreparingAnchorIds.add("pilot-plan");
  }
  if (showExpansionSection) {
    activePreparingAnchorIds.add("expansion-scenarios");
  }
  if (showResearchSection) {
    activePreparingAnchorIds.add("research");
  }
  if (showSourcesSection) {
    activePreparingAnchorIds.add("sources");
  }
  const visibleActiveAnchorItems = isBuildingReport
    ? activeAnchorItems.filter((item) => activePreparingAnchorIds.has(item.id))
    : activeAnchorItems;
  const showJumpToNavigation = !isBuildingReport || visibleActiveAnchorItems.length > 0;
  const hasSelectedSources = selectedSourceIds.length > 0;
  const lastUpdatedAt =
    status?.currentRun?.updatedAt ??
    status?.report.updatedAt ??
    document.currentRun?.updatedAt ??
    document.report.updatedAt;
  const isTerminalReport = liveReportStatus === "ready" || liveReportStatus === "ready_with_limited_coverage";
  const showDesktopSourceRail = hasSelectedSources;
  const showHardFailureState = document.result.state === "failed";
  const retryHref = `/?url=${encodeURIComponent(document.report.normalizedInputUrl)}`;
  const markdownButtonState = getExportButtonState({
    artifactDownloadPath: downloadableMarkdownArtifact?.downloadPath ?? null,
    artifactType: "markdown",
    shareId,
    isTerminalReport,
    run: liveRun,
  });
  const pdfButtonState = getExportButtonState({
    artifactDownloadPath: downloadablePdfArtifact?.downloadPath ?? null,
    artifactType: "pdf",
    shareId,
    isTerminalReport,
    run: liveRun,
  });
  const briefPendingSectionTargets = pendingSectionTargets.filter((section) => section.id !== "research");
  const showBriefReadiness = isBuildingReport && briefPendingSectionTargets.length > 0;
  const showMotionSummaryCard = canonicalReport
    ? !isGroundedFallbackBrief
    : Boolean(accountPlan && !isGroundedFallbackBrief);
  const showEvidenceSummaryCard = researchCompleteness !== null || document.result.hasThinEvidence || !isBuildingReport;
  const showTopOpportunitySummaryCard = Boolean(topOpportunity && !isGroundedFallbackBrief);
  const showGroundedBriefSummaryCard = canonicalReport
    ? Boolean(isGroundedFallbackBrief && canonicalReport.grounded_fallback?.summary)
    : Boolean(isGroundedFallbackBrief && accountPlan?.groundedFallbackBrief?.summary);
  const showSummaryHighlights =
    showMotionSummaryCard || showEvidenceSummaryCard || showTopOpportunitySummaryCard || showGroundedBriefSummaryCard;
  const activeBuildStatusMessage = "Researching the company and drafting the brief";
  const activeBuildHelperText = "This page updates automatically. Exports become available when the report is ready.";
  const exportHelperText = isTerminalReport
    ? downloadableMarkdownArtifact && downloadablePdfArtifact
      ? "Markdown and PDF exports are generated from this saved brief."
      : downloadableMarkdownArtifact && !downloadablePdfArtifact
        ? "Markdown is ready now. PDF can be prepared on demand from this saved brief."
        : !downloadableMarkdownArtifact && downloadablePdfArtifact
          ? "PDF is ready now. Markdown can be prepared on demand from this saved brief."
          : "Exports can be prepared from this saved brief whenever you need them."
    : isBuildingReport
      ? activeBuildHelperText
      : null;
  const heroActionButtonClass = "justify-start md:justify-center";
  const showHeroExportActions = !isBuildingReport;

  useEffect(() => {
    if (!status?.isTerminal) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const shouldRefreshExports =
      liveRun?.displayStatus !== "completed" &&
      liveRun?.displayStatus !== "completed_with_grounded_fallback" &&
      (!downloadableMarkdownArtifact || !downloadablePdfArtifact);

    if (!shouldRefreshExports) {
      return;
    }

    const scheduleRefresh = (delayMs: number) => {
      if (cancelled || attempts >= 12) {
        return;
      }

      timer = setTimeout(async () => {
        setIsRefreshingDocument(true);

        try {
          const nextDocument = await fetchReportDocument(shareId);

          if (cancelled) {
            return;
          }

          attempts += 1;
          setDocument(nextDocument);
          setDocumentError(null);

          const nextRunStatus = nextDocument.currentRun?.displayStatus ?? null;
          const nextMarkdownReady = hasDownloadableArtifact(nextDocument.artifacts, "markdown");
          const nextPdfReady = hasDownloadableArtifact(nextDocument.artifacts, "pdf");

          if (
            nextRunStatus !== "completed" &&
            nextRunStatus !== "completed_with_grounded_fallback" &&
            (!nextMarkdownReady || !nextPdfReady)
          ) {
            scheduleRefresh(nextMarkdownReady ? 4_000 : 1_500);
          }
        } catch {
          if (!cancelled) {
            attempts += 1;
            setDocumentError("Unable to refresh the full report payload right now.");
            scheduleRefresh(4_000);
          }
        } finally {
          if (!cancelled) {
            setIsRefreshingDocument(false);
          }
        }
      }, delayMs);
    };

    scheduleRefresh(downloadableMarkdownArtifact ? 4_000 : 1_500);

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [downloadableMarkdownArtifact, downloadablePdfArtifact, liveRun?.displayStatus, shareId, status?.isTerminal]);

  const handleSelectSources = (sourceIds: number[]) => {
    setSelectedSourceIds(sourceIds);

    if (window.matchMedia("(max-width: 1279px)").matches) {
      setIsMobileSourcePanelOpen(true);
    }
  };

  const handleOpenBuildDetails = () => {
    setReportMode("build");
    requestAnimationFrame(() => {
      window.location.hash = "build-details";
    });
  };

  return (
    <SectionFrame className="overflow-hidden py-8 sm:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/60 via-background/35 to-background/60"
      />
      <Container
        className="relative mx-auto grid max-w-[80rem] gap-5 xl:grid-cols-[minmax(0,60rem)] xl:justify-center"
      >
        <div className="mx-auto w-full max-w-[60rem] space-y-6 xl:max-w-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/82 px-4 py-2 text-sm text-foreground transition hover:border-primary/30 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              New report
            </Link>
            {!isBuildingReport ? (
              <div className="flex flex-wrap items-center gap-2">
                {isRefreshingDocument ? (
                  <Badge className="rounded-full px-3 py-1" variant="outline">
                    <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Refreshing report
                  </Badge>
                ) : null}
                <Badge className="rounded-full px-4 py-1.5" variant="outline">
                  {heroStatusLabel}
                </Badge>
              </div>
            ) : null}
          </div>

          <Card className="overflow-hidden border-border/60 bg-card/86 shadow-panel">
            <CardHeader className="space-y-4 sm:space-y-5">
              <div className="space-y-3">
                <div className="space-y-2">
                  <h1 className="text-balance text-4xl leading-tight text-primary sm:text-5xl">
                    {companyDisplayName}
                  </h1>
                  <p className="text-base font-medium text-foreground/70 sm:text-lg">AI account brief</p>
                  <p className="max-w-2xl text-base leading-6 text-foreground/70 sm:text-[1.02rem] sm:leading-7">
                    {heroSummary}
                  </p>
                </div>

                <div
                  className={cn(
                    "grid gap-3",
                    showHeroExportActions ? "md:grid-cols-[minmax(0,1fr)_auto] md:items-start" : null,
                  )}
                >
                  <div className="flex min-w-0 flex-wrap items-start gap-2 rounded-[1.25rem] border border-border/50 bg-background/38 p-3 text-xs text-foreground/65 md:border-0 md:bg-transparent md:p-0 md:text-sm">
                    <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-border/50 bg-background/62 px-3 py-1.5">
                      <Link2 className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{document.report.canonicalDomain}</span>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/62 px-3 py-1.5">
                      <RefreshCcw className="h-4 w-4 shrink-0 text-primary" />
                      Updated {formatDateTime(lastUpdatedAt)}
                    </div>
                    <details className="w-full rounded-[1.25rem] border border-border/50 bg-background/62 px-3 py-1.5 text-xs text-foreground/70 sm:text-sm md:w-auto">
                      <summary className="cursor-pointer list-none font-medium text-foreground [&::-webkit-details-marker]:hidden">
                        Report metadata
                      </summary>
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                        <div className="rounded-3xl border border-border/60 bg-card/68 p-3">
                          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                            Share ID
                          </div>
                          <div className="mt-2 font-mono text-xs text-foreground">{document.report.shareId}</div>
                        </div>
                        <div className="rounded-3xl border border-border/60 bg-card/68 p-3">
                          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                            Domain
                          </div>
                          <div className="mt-2 text-xs text-foreground">{document.report.canonicalDomain}</div>
                        </div>
                        <div className="rounded-3xl border border-border/60 bg-card/68 p-3 sm:col-span-2">
                          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                            Submitted URL
                          </div>
                          <div className="mt-2 break-all text-xs text-foreground">{document.report.normalizedInputUrl}</div>
                        </div>
                        <div className="rounded-3xl border border-border/60 bg-card/68 p-3">
                          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                            Last updated
                          </div>
                          <div className="mt-2 text-xs text-foreground">{formatDateTime(lastUpdatedAt)}</div>
                        </div>
                        <div className="rounded-3xl border border-border/60 bg-card/68 p-3">
                          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                            Status
                          </div>
                          <div className="mt-2 text-xs text-foreground">{primaryStatusLabel}</div>
                        </div>
                      </div>
                    </details>
                  </div>
                  {showHeroExportActions ? (
                    <div className="grid gap-2 rounded-[1.25rem] border border-border/50 bg-background/38 p-3 md:flex md:flex-wrap md:justify-end md:border-0 md:bg-transparent md:p-0">
                      {!markdownButtonState.disabled && markdownButtonState.href ? (
                        <Button type="button" size="sm" className={heroActionButtonClass} asChild>
                          <a href={markdownButtonState.href}>
                            <Download className="h-4 w-4" />
                            {markdownButtonState.label}
                          </a>
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="outline" className={heroActionButtonClass} disabled>
                          <Download className="h-4 w-4" />
                          {markdownButtonState.label}
                        </Button>
                      )}
                      {!pdfButtonState.disabled && pdfButtonState.href ? (
                        <Button type="button" size="sm" variant="outline" className={heroActionButtonClass} asChild>
                          <a href={pdfButtonState.href}>
                            <Download className="h-4 w-4" />
                            {pdfButtonState.label}
                          </a>
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="outline" className={heroActionButtonClass} disabled>
                          <Download className="h-4 w-4" />
                          {pdfButtonState.label}
                        </Button>
                      )}
                      {showHardFailureState ? (
                        <Button type="button" size="sm" variant="outline" className={heroActionButtonClass} asChild>
                          <Link href={retryHref}>
                            <RefreshCcw className="h-4 w-4" />
                            Start a fresh run
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {exportHelperText ? <p className="text-sm leading-6 text-foreground/70 sm:leading-7">{exportHelperText}</p> : null}
              </div>

              {showSummaryHighlights ? (
                <div className="grid gap-3 lg:grid-cols-3">
                  {showMotionSummaryCard ? (
                    <div className="rounded-[1.5rem] border border-border/50 bg-background/68 p-4">
                      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        Recommended motion
                      </div>
                      <div className="mt-2 font-medium text-foreground">{motionRecommendation}</div>
                      <p className="mt-2 text-sm leading-6 text-foreground/70 sm:leading-7">
                        {canonicalReport?.recommended_motion.rationale ?? accountPlan?.overallAccountMotion.rationale}
                      </p>
                    </div>
                  ) : null}
                  {showEvidenceSummaryCard ? (
                    <div className="rounded-[1.5rem] border border-border/50 bg-background/68 p-4">
                      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        Evidence coverage
                      </div>
                      <div className={cn("mt-2 font-medium", confidenceTone(researchCompleteness))}>
                        {researchCompleteness !== null ? `${researchCompleteness}/100` : document.result.label}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground/70 sm:leading-7">
                        {normalizeVisibleCopy(document.result.summary)}
                      </p>
                    </div>
                  ) : null}
                  {showTopOpportunitySummaryCard ? (
                    <div className="rounded-[1.5rem] border border-border/50 bg-background/68 p-4">
                      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        Top opportunity
                      </div>
                      <div className="mt-2 font-medium text-foreground">
                        {topOpportunity
                          ? "workflow_name" in topOpportunity
                            ? topOpportunity.workflow_name
                            : topOpportunity.workflowName
                          : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground/70 sm:leading-7">{topOpportunity?.summary}</p>
                    </div>
                  ) : null}
                  {showGroundedBriefSummaryCard ? (
                    <div className="rounded-[1.5rem] border border-border/50 bg-background/68 p-4">
                      <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        Grounded brief
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground/70 sm:leading-7">
                        {canonicalReport?.grounded_fallback?.summary ?? accountPlan?.groundedFallbackBrief?.summary}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardHeader>
          </Card>

          <nav
            aria-label="Report sections"
            className="sticky top-[5rem] z-20 overflow-hidden rounded-[1.5rem] border border-border/60 bg-panel/86 px-3 py-2.5 shadow-panel backdrop-blur-xl"
          >
            <div className="flex min-w-0 flex-col gap-2.5">
              {isBuildingReport ? (
                <div className="rounded-[1.25rem] border border-border/50 bg-background/74 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                        {activeBuildStatusMessage}
                      </div>
                      <p className="text-xs text-foreground/70">
                        This page updates automatically.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full px-3 py-1" variant="secondary">
                        In progress
                      </Badge>
                      <span className="text-xs text-foreground/70">Updated {formatDateTime(lastUpdatedAt)}</span>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-primary/35 via-primary to-primary/35 animate-pulse" />
                  </div>
                </div>
              ) : null}

              <div className="flex min-w-0 flex-col gap-2">
                <div className="-mx-1 overflow-x-auto px-1 pb-1">
                  <div className="flex min-w-max items-center gap-2">
                    {primaryReportModes.map((mode) => (
                      <Button
                        key={mode.id}
                        type="button"
                        size="sm"
                        variant={reportMode === mode.id ? "secondary" : "outline"}
                        className="shrink-0"
                        onClick={() => setReportMode(mode.id)}
                      >
                        {mode.label}
                      </Button>
                    ))}
                    <div className="h-5 w-px shrink-0 bg-border/60" />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={cn(
                        "shrink-0",
                        reportMode === "build"
                          ? "text-foreground"
                          : "border-transparent bg-transparent text-foreground/70 hover:border-border/50",
                      )}
                      onClick={handleOpenBuildDetails}
                    >
                      Build details
                    </Button>
                    {hasSelectedSources ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 xl:hidden"
                        onClick={() => setIsMobileSourcePanelOpen(true)}
                      >
                        <BookOpenText className="h-4 w-4" />
                        Sources
                      </Button>
                    ) : null}
                  </div>
                </div>
                {showJumpToNavigation ? (
                  <div className="-mx-1 overflow-x-auto px-1 pb-1">
                    <div className="flex min-w-max items-center gap-2">
                      <span className="pl-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        Jump to
                      </span>
                      {visibleActiveAnchorItems.map((item) => (
                        <a
                          key={item.id}
                          href={`#${item.id}`}
                          className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : isBuildingReport ? (
                  <div className="px-1 pb-1 text-xs text-foreground/65">
                    Section links appear here as soon as content is ready.
                  </div>
                ) : null}
              </div>
            </div>
          </nav>

          {documentError ? (
            <div className="rounded-[1.75rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {documentError}
            </div>
          ) : null}

          {reportMode === "brief" ? (
            <>
              <ReportSection
                id="overview"
                eyebrow="Brief"
                title="Executive summary"
                description="Seller-ready summary of account context, recommended motion, and the main evidence caveats."
              >
                <div
                  className={cn(
                    "grid min-w-0 gap-4",
                    currentRun ? "xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" : "xl:grid-cols-1",
                  )}
                >
                  {(canonicalReport || accountPlan) && !isGroundedFallbackBrief ? (
                    <Card className="min-w-0 border-strong/70 bg-card/80 shadow-panel">
                      <CardHeader className="space-y-2.5">
                        <CardTitle className="flex items-center gap-2 text-2xl">
                          <Target className="h-5 w-5 text-primary" />
                          Recommended motion
                        </CardTitle>
                      </CardHeader>
                      <CardContent className={cn("min-w-0", reportCardFlowClass)}>
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge className="rounded-full px-4 py-1.5 uppercase" variant="secondary">
                            {motionRecommendation}
                          </Badge>
                          {researchCompleteness !== null ? (
                            <span className={cn("text-sm font-medium", confidenceTone(researchCompleteness))}>
                              Evidence coverage {researchCompleteness}/100
                            </span>
                          ) : null}
                        </div>
                        <p>
                          {canonicalReport?.recommended_motion.rationale ?? accountPlan?.overallAccountMotion.rationale}
                        </p>
                        {topOpportunity ? (
                          <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                            <div className="font-medium text-foreground">Top opportunity</div>
                            <div className="mt-2 text-base text-foreground">
                              {"workflow_name" in topOpportunity ? topOpportunity.workflow_name : topOpportunity.workflowName}
                            </div>
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">
                              {"summary" in topOpportunity ? topOpportunity.summary : null}
                            </p>
                          </div>
                        ) : null}
                        <EvidencePills
                          sourceIds={
                            canonicalReport
                              ? canonicalCitationSourceIds(canonicalReport.recommended_motion.citations)
                              : accountPlan?.overallAccountMotion.evidenceSourceIds ?? []
                          }
                          sources={document.sources}
                          onSelectSources={handleSelectSources}
                        />
                      </CardContent>
                    </Card>
                  ) : null}

                  {(canonicalReport || accountPlan) && isGroundedFallbackBrief ? (
                  <Card className="min-w-0 border-strong/70 bg-card/80 shadow-panel">
                    <CardHeader className="space-y-2.5">
                      <CardTitle className="flex items-center gap-2 text-2xl">
                          <Target className="h-5 w-5 text-primary" />
                          Grounded brief
                        </CardTitle>
                      </CardHeader>
                      <CardContent className={cn("min-w-0", reportCardFlowClass)}>
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge className="rounded-full px-4 py-1.5 uppercase" variant="secondary">
                            Grounded brief
                          </Badge>
                          {researchCompleteness !== null ? (
                            <span className={cn("text-sm font-medium", confidenceTone(researchCompleteness))}>
                              Evidence coverage {researchCompleteness}/100
                            </span>
                          ) : null}
                        </div>
                        <p>
                          {canonicalReport?.grounded_fallback?.summary ?? accountPlan?.groundedFallbackBrief?.summary}
                        </p>
                        {(canonicalReport?.grounded_fallback?.opportunity_hypothesis_note ??
                          accountPlan?.groundedFallbackBrief?.opportunityHypothesisNote) ? (
                          <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                            <div className="font-medium text-foreground">Opportunity hypotheses</div>
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">
                              {canonicalReport?.grounded_fallback?.opportunity_hypothesis_note ??
                                accountPlan?.groundedFallbackBrief?.opportunityHypothesisNote}
                            </p>
                          </div>
                        ) : null}
                        <EvidencePills
                          sourceIds={
                            canonicalReport?.grounded_fallback
                              ? canonicalCitationSourceIds(canonicalReport.grounded_fallback.citations)
                              : accountPlan?.groundedFallbackBrief?.sourceIds ?? researchSummary?.companyIdentity.sourceIds ?? []
                          }
                          sources={document.sources}
                          onSelectSources={handleSelectSources}
                        />
                      </CardContent>
                    </Card>
                  ) : null}

                  <Card className="min-w-0 max-w-full border-strong/70 bg-card/80 shadow-panel">
                    <CardHeader className="space-y-2.5">
                      <CardTitle className="text-2xl">Company context</CardTitle>
                    </CardHeader>
                    <CardContent className={cn("min-w-0 break-words", reportCardFlowClass)}>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{companyDisplayName}</div>
                        <div>
                          {canonicalReport?.company.archetype ??
                            researchSummary?.companyIdentity.archetype ??
                            "Identity resolution pending"}
                        </div>
                      </div>
                      {canonicalReport?.executive_summary.summary ? (
                        <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                          <div className="font-medium text-foreground">Executive summary</div>
                          <p className="mt-2">{canonicalReport.executive_summary.summary}</p>
                        </div>
                      ) : null}
                      {canonicalReport?.company.company_brief ? (
                        <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                          <div className="font-medium text-foreground">Company brief</div>
                          <p className="mt-2">{canonicalReport.company.company_brief}</p>
                        </div>
                      ) : null}
                      {canonicalReport || researchSummary ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-3xl border border-border/70 bg-background/75 p-3">
                            <div className="font-medium text-foreground">AI maturity</div>
                            <div className="mt-1">
                              {canonicalReport?.ai_maturity_signals.maturity_level ?? researchSummary?.aiMaturityEstimate.level}
                            </div>
                          </div>
                          <div className="rounded-3xl border border-border/70 bg-background/75 p-3">
                            <div className="font-medium text-foreground">Regulatory sensitivity</div>
                            <div className="mt-1">
                              {canonicalReport?.ai_maturity_signals.regulatory_sensitivity.level ??
                                researchSummary?.regulatorySensitivity.level}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {canonicalReport?.executive_summary ? (
                        <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                          <div className="font-medium text-foreground">Why now</div>
                          <ul className="mt-2 space-y-2">
                            <li>• {canonicalReport.executive_summary.why_now}</li>
                            <li>• {canonicalReport.executive_summary.strategic_takeaway}</li>
                          </ul>
                        </div>
                      ) : researchSummary?.growthPriorities.length ? (
                        <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                          <div className="font-medium text-foreground">Executive priorities</div>
                          <ul className="mt-2 space-y-2">
                            {researchSummary.growthPriorities.slice(0, 3).map((item, index) => (
                              <li key={`${item.summary}-${index}`}>• {item.summary}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {canonicalReport || researchSummary ? (
                        <EvidencePills
                          sourceIds={
                            canonicalReport
                              ? canonicalCitationSourceIds(canonicalReport.company.citations)
                              : researchSummary?.companyIdentity.sourceIds ?? []
                          }
                          sources={document.sources}
                          onSelectSources={handleSelectSources}
                        />
                      ) : null}
                    </CardContent>
                  </Card>
                </div>

              </ReportSection>

              {showBriefReadiness ? (
                <Card className="border-border/60 bg-card/74 shadow-none">
                  <CardHeader className="space-y-2.5 p-5">
                    <CardTitle className="text-xl">Brief readiness</CardTitle>
                    <p className="text-sm leading-6 text-foreground/70">
                      This quick map stays secondary while the report is finishing. Sections appear here once the saved brief has usable evidence.
                    </p>
                  </CardHeader>
                  <CardContent className="grid gap-2.5 p-5 pt-0 sm:grid-cols-2 xl:grid-cols-4">
                    {briefPendingSectionTargets.map((section) => (
                      <div
                        key={section.id}
                        id={section.id}
                        className="scroll-mt-32 rounded-[1.5rem] border border-border/60 bg-background/68 px-4 py-3.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-foreground">
                            {section.id === "use-cases"
                              ? "Top opportunities"
                              : section.id === "stakeholders"
                                ? "Buying map"
                                : section.id === "pilot-plan"
                                  ? "90-day pilot"
                              : "Expansion"}
                          </div>
                          <Badge className="rounded-full px-3 py-1" variant="outline">
                            {section.readyCount > 0 ? (
                              `${section.readyCount}/${section.totalCount}`
                            ) : (
                              <>
                                <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />
                                In progress
                              </>
                            )}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {section.readyCount > 0 ? "Partially ready" : "In progress"}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              {((canonicalReport && !isGroundedFallbackBrief && canonicalTopOpportunities.length > 0) ||
                (!canonicalReport && accountPlan && !isGroundedFallbackBrief)) ? (
                <ReportSection
                  id="use-cases"
                  eyebrow="Brief"
                  title="Top opportunities"
                  description="Start with the highest-priority AI opportunities, then open the full list if needed."
                >
                  <div className="space-y-5 sm:space-y-4">
                    <div className="grid gap-4 lg:grid-cols-3">
                      {(canonicalReport ? canonicalTopOpportunities.slice(0, 3) : accountPlan?.topUseCases ?? []).map((useCase) => {
                        const item = getRenderableOpportunity(useCase);

                        return (
                          <Card key={`top-${item.key}`} className="border-strong/70 bg-card/85 shadow-panel">
                            <CardHeader className="space-y-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <Badge variant="secondary" className="rounded-full px-3 py-1">
                                  Top {item.priorityRank}
                                </Badge>
                                <Badge variant="outline" className="rounded-full px-3 py-1">
                                  {item.scorecard.priorityScore}
                                </Badge>
                              </div>
                              <CardTitle className="text-xl">{item.workflowName}</CardTitle>
                              <p className="text-sm text-muted-foreground">{formatDepartmentLabel(item.department)}</p>
                            </CardHeader>
                            <CardContent className={reportCardFlowClass}>
                              <p>{item.summary}</p>
                              <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                <div className="font-medium text-foreground">Expected outcome</div>
                                <p className="mt-2">{item.expectedOutcome}</p>
                              </div>
                              <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                <div className="font-medium text-foreground">Why now</div>
                                <p className="mt-2">{item.whyNow}</p>
                              </div>
                              <EvidencePills
                                sourceIds={item.sourceIds}
                                sources={document.sources}
                                onSelectSources={handleSelectSources}
                              />
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    {remainingUseCases.length > 0 ? (
                      <details className="rounded-[1.75rem] border border-border/70 bg-card/76 p-5">
                        <summary className="cursor-pointer list-none font-medium text-foreground [&::-webkit-details-marker]:hidden">
                          View all use cases
                        </summary>
                        <div className="mt-4 grid gap-4 xl:grid-cols-2">
                          {remainingUseCases.map((useCase) => {
                            const item = getRenderableOpportunity(useCase);

                            return (
                              <Card key={item.key} className="border-strong/70 bg-card/80 shadow-none">
                                <CardHeader className="space-y-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="space-y-1">
                                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                        Rank {item.priorityRank} · {formatDepartmentLabel(item.department)}
                                      </div>
                                      <CardTitle className="text-xl">{item.workflowName}</CardTitle>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                                        {formatMotionLabel(item.recommendedMotion)}
                                      </Badge>
                                      <Badge variant="outline" className="rounded-full px-3 py-1">
                                        {item.scorecard.priorityScore}
                                      </Badge>
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className={reportCardFlowClass}>
                                  <p>{item.summary}</p>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                      <div className="font-medium text-foreground">Pain point</div>
                                      <p className="mt-2">{item.painPoint}</p>
                                    </div>
                                    <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                      <div className="font-medium text-foreground">Why now</div>
                                      <p className="mt-2">{item.whyNow}</p>
                                    </div>
                                  </div>

                                  <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                    <div className="font-medium text-foreground">Expected outcome</div>
                                    <p className="mt-2">{item.expectedOutcome}</p>
                                  </div>

                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                      <div className="font-medium text-foreground">Likely users</div>
                                      <ul className="mt-2 space-y-1">
                                        {item.likelyUsers.map((value) => (
                                          <li key={value}>• {value}</li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                      <div className="font-medium text-foreground">Metrics</div>
                                      <ul className="mt-2 space-y-1">
                                        {item.metrics.map((value) => (
                                          <li key={value}>• {value}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>

                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                      <div className="font-medium text-foreground">Dependencies</div>
                                      {item.dependencies.length > 0 ? (
                                        <ul className="mt-2 space-y-1">
                                          {item.dependencies.map((value) => (
                                            <li key={value}>• {value}</li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="mt-2">No major dependencies identified in public evidence.</p>
                                      )}
                                    </div>
                                    <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                      <div className="font-medium text-foreground">Security and compliance notes</div>
                                      {item.securityComplianceNotes.length > 0 ? (
                                        <ul className="mt-2 space-y-1">
                                          {item.securityComplianceNotes.map((value) => (
                                            <li key={value}>• {value}</li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="mt-2">No additional notes were supported by public evidence.</p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                    <div className="font-medium text-foreground">Motion rationale</div>
                                    <p className="mt-2">{item.motionRationale}</p>
                                  </div>

                                  <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                    <div className="font-medium text-foreground">Score breakdown</div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                      {[
                                        ["Business value", item.scorecard.businessValue],
                                        ["Deployment readiness", item.scorecard.deploymentReadiness],
                                        ["Expansion potential", item.scorecard.expansionPotential],
                                        ["OpenAI fit", item.scorecard.openaiFit],
                                        ["Sponsor likelihood", item.scorecard.sponsorLikelihood],
                                        ["Evidence confidence", item.scorecard.evidenceConfidence],
                                        ["Risk penalty", item.scorecard.riskPenalty],
                                        ["Priority score", item.scorecard.priorityScore],
                                      ].map(([label, value]) => (
                                        <div key={label} className="rounded-2xl border border-border/70 bg-card px-3 py-2">
                                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
                                          <div className="mt-1 font-medium text-foreground">{value}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                    <div className="font-medium text-foreground">Open questions</div>
                                    <ul className="mt-2 space-y-1">
                                      {item.openQuestions.map((value) => (
                                        <li key={value}>• {value}</li>
                                      ))}
                                    </ul>
                                  </div>

                                  <EvidencePills
                                    sourceIds={item.sourceIds}
                                    sources={document.sources}
                                    onSelectSources={handleSelectSources}
                                  />
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </ReportSection>
              ) : null}

              {((canonicalReport && isGroundedFallbackBrief && canonicalTopOpportunities.length > 0) ||
                (!canonicalReport && accountPlan && isGroundedFallbackBrief && accountPlan.candidateUseCases.length > 0)) ? (
                <ReportSection
                  id="use-cases"
                  eyebrow="Brief"
                  title="Grounded opportunity hypotheses"
                  description="These hypotheses cleared the minimum grounding bar, but they remain lower-confidence than a normal prioritized opportunity set."
                >
                  <div className="grid gap-4 lg:grid-cols-3">
                    {(canonicalReport ? canonicalTopOpportunities : accountPlan?.candidateUseCases ?? []).map((useCase) => {
                      const item = getRenderableOpportunity(useCase);

                      return (
                        <Card key={`hypothesis-${item.key}`} className="border-strong/70 bg-card/80 shadow-none">
                          <CardHeader className="space-y-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <Badge variant="secondary" className="rounded-full px-3 py-1">
                                Hypothesis
                              </Badge>
                              <Badge variant="outline" className="rounded-full px-3 py-1">
                                {item.scorecard.evidenceConfidence}/100 evidence
                              </Badge>
                            </div>
                            <CardTitle className="text-xl">{item.workflowName}</CardTitle>
                            <p className="text-sm text-muted-foreground">{formatDepartmentLabel(item.department)}</p>
                          </CardHeader>
                          <CardContent className={reportCardFlowClass}>
                            <p>{item.summary}</p>
                            <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                              <div className="font-medium text-foreground">Why it may matter</div>
                              <p className="mt-2">{item.whyNow}</p>
                            </div>
                            <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                              <div className="font-medium text-foreground">Potential outcome</div>
                              <p className="mt-2">{item.expectedOutcome}</p>
                            </div>
                            <EvidencePills
                              sourceIds={item.sourceIds}
                              sources={document.sources}
                              onSelectSources={handleSelectSources}
                            />
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </ReportSection>
              ) : null}

              {((canonicalReport && (stakeholderHypotheses.length > 0 || hasDiscoveryContent)) ||
                (!canonicalReport && accountPlan && (accountPlan.stakeholderHypotheses.length > 0 || hasDiscoveryContent))) ? (
                <ReportSection
                  id="stakeholders"
                  eyebrow="Brief"
                  title="Buying map"
                  description="Use these stakeholder hypotheses, objections, and discovery prompts to shape the deal."
                >
                  <div className="space-y-4">
                    {stakeholderHypotheses.length > 0 ? (
                      <div className="grid gap-4 xl:grid-cols-3">
                        {stakeholderHypotheses.map((stakeholder) => {
                          const item = getRenderableStakeholder(stakeholder);

                          return (
                            <Card
                              key={`${item.likelyRole}-${item.hypothesis}`}
                              className="border-strong/70 bg-card/80 shadow-none"
                            >
                              <CardHeader className="space-y-2.5">
                                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  {item.department ?? "Cross-functional"}
                                </div>
                                <CardTitle className="text-xl">{item.likelyRole}</CardTitle>
                              </CardHeader>
                              <CardContent className={reportCardFlowCompactClass}>
                                <p>{item.hypothesis}</p>
                                <p>{item.rationale}</p>
                                <Badge variant="outline" className="rounded-full px-3 py-1">
                                  {item.confidence}/100 confidence
                                </Badge>
                                <EvidencePills
                                  sourceIds={item.sourceIds}
                                  sources={document.sources}
                                  onSelectSources={handleSelectSources}
                                />
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    ) : null}

                    {hasDiscoveryContent ? (
                      <div className="grid gap-4 lg:grid-cols-2">
                        {objections.length > 0 ? (
                          <Card className="border-strong/70 bg-card/80 shadow-none">
                            <CardHeader>
                              <CardTitle className="text-xl">Likely objections</CardTitle>
                            </CardHeader>
                            <CardContent className={reportCardFlowClass}>
                              {objections.map((item) => {
                                const objection = getRenderableObjection(item);

                                return (
                                  <div key={objection.key} className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                    <div className="font-medium text-foreground">{objection.objection}</div>
                                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{objection.rebuttal}</p>
                                    <div className="mt-3">
                                      <EvidencePills
                                        sourceIds={objection.sourceIds}
                                        sources={document.sources}
                                        onSelectSources={handleSelectSources}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </CardContent>
                          </Card>
                        ) : null}

                        {discoveryQuestions.length > 0 ? (
                          <Card className="border-strong/70 bg-card/80 shadow-none">
                            <CardHeader>
                              <CardTitle className="text-xl">Discovery questions</CardTitle>
                            </CardHeader>
                            <CardContent className={reportCardFlowClass}>
                              {discoveryQuestions.map((item) => {
                                const question = getRenderableDiscoveryQuestion(item);

                                return (
                                  <div key={question.key} className="rounded-3xl border border-border/70 bg-background/70 p-4">
                                    <div className="font-medium text-foreground">{question.question}</div>
                                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{question.whyItMatters}</p>
                                    <div className="mt-3">
                                      <EvidencePills
                                        sourceIds={question.sourceIds}
                                        sources={document.sources}
                                        onSelectSources={handleSelectSources}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </CardContent>
                          </Card>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </ReportSection>
              ) : null}

              {pilotPlan ? (
                <ReportSection
                  id="pilot-plan"
                  eyebrow="Brief"
                  title="90-day pilot"
                  description="Start with a conservative 90-day pilot aligned to the current motion recommendation."
                >
                  <div className="space-y-5 sm:space-y-4">
                    <Card className="border-strong/70 bg-card/85 shadow-panel">
                      <CardHeader className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <CardTitle className="text-2xl">Pilot recommendation</CardTitle>
                          <Badge variant="secondary" className="rounded-full px-3 py-1">
                            {formatMotionLabel(
                              "recommended_motion" in pilotPlan ? pilotPlan.recommended_motion : pilotPlan.recommendedMotion,
                            )}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className={cn("grid gap-4 lg:grid-cols-[1fr_0.9fr]", reportBodyTextClass)}>
                        <div className="space-y-4">
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Objective</div>
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">{pilotPlan.objective}</p>
                          </div>
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Scope</div>
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">{pilotPlan.scope}</p>
                          </div>
                          <EvidencePills
                            sourceIds={
                              "citations" in pilotPlan
                                ? canonicalCitationSourceIds(pilotPlan.citations)
                                : pilotPlan.evidenceSourceIds
                            }
                            sources={document.sources}
                            onSelectSources={handleSelectSources}
                          />
                        </div>
                        <div className="grid gap-3">
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Success metrics</div>
                            <ul className="mt-2 space-y-1 text-sm leading-7 text-muted-foreground">
                              {("success_metrics" in pilotPlan ? pilotPlan.success_metrics : pilotPlan.successMetrics).map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Dependencies</div>
                            <ul className="mt-2 space-y-1 text-sm leading-7 text-muted-foreground">
                              {pilotPlan.dependencies.map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                            <div className="font-medium text-foreground">Risks</div>
                            <ul className="mt-2 space-y-1 text-sm leading-7 text-muted-foreground">
                              {pilotPlan.risks.map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid gap-4 xl:grid-cols-3">
                      {pilotPlan.phases.map((phase) => (
                        <Card key={phase.name} className="border-strong/70 bg-card/80 shadow-none">
                          <CardHeader className="space-y-2.5">
                            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{phase.duration}</div>
                            <CardTitle className="text-xl">{phase.name}</CardTitle>
                          </CardHeader>
                          <CardContent className={cn("grid gap-3", reportBodyTextClass)}>
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
                </ReportSection>
              ) : null}

              {(canonicalReport || accountPlan) && hasExpansionContent ? (
                <details
                  id="expansion-scenarios"
                  open={isExpansionOpen}
                  onToggle={(event) => setIsExpansionOpen(event.currentTarget.open)}
                  className="scroll-mt-32 rounded-[1.75rem] border border-border/70 bg-card/80"
                >
                  <summary className="cursor-pointer list-none px-6 py-6 [&::-webkit-details-marker]:hidden">
                    <div className="space-y-2.5">
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Brief</p>
                      <h2 className="text-3xl leading-tight text-primary">Expansion</h2>
                      <p className={reportSectionDescriptionClass}>
                        Expansion paths stay explicit about assumptions and upside.
                      </p>
                    </div>
                  </summary>
                  <div className="border-t border-border/70 p-6 pt-6">
                    <div className="grid gap-4 xl:grid-cols-3">
                      {[
                        { label: "Low case", scenario: expansionScenarios.low },
                        { label: "Base case", scenario: expansionScenarios.base },
                        { label: "High case", scenario: expansionScenarios.high },
                      ]
                        .filter(
                          (item): item is { label: string; scenario: NonNullable<typeof item.scenario> } =>
                            item.scenario !== null,
                        )
                        .map(({ label, scenario }) => (
                        <Card key={label} className="border-strong/70 bg-card/80 shadow-none">
                          <CardHeader>
                            <CardTitle className="text-xl">{label}</CardTitle>
                          </CardHeader>
                          <CardContent className={reportCardFlowClass}>
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
                                {("expected_outcomes" in scenario ? scenario.expected_outcomes : scenario.expectedOutcomes).map((item) => (
                                  <li key={item}>• {item}</li>
                                ))}
                              </ul>
                            </div>
                            <EvidencePills
                              sourceIds={
                                "citations" in scenario
                                  ? canonicalCitationSourceIds(scenario.citations)
                                  : scenario.evidenceSourceIds
                              }
                              sources={document.sources}
                              onSelectSources={handleSelectSources}
                            />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </details>
              ) : null}
            </>
          ) : null}

          {reportMode === "evidence" ? (
            <>
              <ReportSection
                id="research"
                eyebrow="Evidence"
                title="Research"
                description="Research detail, fact classification, and citation traceability live here."
              >
                {canonicalReport ? (
                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    <Card className="min-w-0 overflow-hidden border-strong/70 bg-card/80 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-xl">Executive summary</CardTitle>
                      </CardHeader>
                      <CardContent className={cn("min-w-0 space-y-4", reportBodyTextClass)}>
                        <div className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4">
                          <p>{canonicalReport.executive_summary.summary}</p>
                          <div className="mt-3 min-w-0">
                            <EvidencePills
                              sourceIds={canonicalCitationSourceIds(canonicalReport.executive_summary.citations)}
                              sources={document.sources}
                              onSelectSources={handleSelectSources}
                            />
                          </div>
                        </div>
                        <div className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">Why now</div>
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">{canonicalReport.executive_summary.why_now}</p>
                        </div>
                        <div className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4">
                          <div className="font-medium text-foreground">Strategic takeaway</div>
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">
                            {canonicalReport.executive_summary.strategic_takeaway}
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="min-w-0 overflow-hidden border-strong/70 bg-card/80 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-xl">Signal summary</CardTitle>
                      </CardHeader>
                      <CardContent className={cn("grid min-w-0 gap-4", reportBodyTextClass)}>
                        {[
                          {
                            label: "AI maturity",
                            value: `${canonicalReport.ai_maturity_signals.maturity_level}: ${canonicalReport.ai_maturity_signals.maturity_summary}`,
                            sourceIds: canonicalCitationSourceIds(canonicalReport.ai_maturity_signals.citations),
                          },
                          {
                            label: "Regulatory sensitivity",
                            value: `${canonicalReport.ai_maturity_signals.regulatory_sensitivity.level}: ${canonicalReport.ai_maturity_signals.regulatory_sensitivity.rationale}`,
                            sourceIds: canonicalCitationSourceIds(canonicalReport.ai_maturity_signals.regulatory_sensitivity.citations),
                          },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4"
                          >
                            <div className="font-medium text-foreground">{item.label}</div>
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.value}</p>
                            <div className="mt-3 min-w-0">
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

                    <Card className="min-w-0 overflow-hidden border-strong/70 bg-card/80 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-xl">Company brief</CardTitle>
                      </CardHeader>
                      <CardContent className={cn("min-w-0 space-y-4", reportBodyTextClass)}>
                        <div className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4">
                          <p>{canonicalReport.company.company_brief}</p>
                          <div className="mt-3 min-w-0">
                            <EvidencePills
                              sourceIds={canonicalCitationSourceIds(canonicalReport.company.citations)}
                              sources={document.sources}
                              onSelectSources={handleSelectSources}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="min-w-0 overflow-hidden border-strong/70 bg-card/80 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-xl">Notable signals</CardTitle>
                      </CardHeader>
                      <CardContent className={cn("min-w-0 space-y-4", reportBodyTextClass)}>
                        {canonicalReport.ai_maturity_signals.notable_signals.length > 0 ? (
                          canonicalReport.ai_maturity_signals.notable_signals.map((item, index) => (
                            <div
                              key={`${item.summary}-${index}`}
                              className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4"
                            >
                              <p>{item.summary}</p>
                              <div className="mt-3 min-w-0">
                                <EvidencePills
                                  sourceIds={canonicalCitationSourceIds(item.citations)}
                                  sources={document.sources}
                                  onSelectSources={handleSelectSources}
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <EmptySection
                            title="Notable signals not established yet"
                            description="Available public evidence did not support additional notable signals beyond the core brief."
                            compact={isBuildingReport}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : researchSummary ? (
                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    {researchSummary.growthPriorities.length > 0 || !isBuildingReport ? (
                      <Card className="min-w-0 overflow-hidden border-strong/70 bg-card/80 shadow-none">
                        <CardHeader>
                          <CardTitle className="text-xl">Growth priorities</CardTitle>
                        </CardHeader>
                        <CardContent className={cn("min-w-0 space-y-4", reportBodyTextClass)}>
                          {researchSummary.growthPriorities.length > 0 ? (
                            researchSummary.growthPriorities.map((item, index) => (
                              <div
                                key={`${item.summary}-${index}`}
                                className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4"
                              >
                                <p>{item.summary}</p>
                                <div className="mt-3 min-w-0">
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
                              compact={isBuildingReport}
                            />
                          )}
                        </CardContent>
                      </Card>
                    ) : null}

                    <Card className="min-w-0 overflow-hidden border-strong/70 bg-card/80 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-xl">Signal summary</CardTitle>
                      </CardHeader>
                      <CardContent className={cn("grid min-w-0 gap-4", reportBodyTextClass)}>
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
                          <div
                            key={item.label}
                            className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4"
                          >
                            <div className="font-medium text-foreground">{item.label}</div>
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.value}</p>
                            <div className="mt-3 min-w-0">
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
                    ]
                      .filter((group) => group.items.length > 0 || !isBuildingReport)
                      .map((group) => (
                        <Card key={group.title} className="min-w-0 overflow-hidden border-strong/70 bg-card/80 shadow-none">
                          <CardHeader>
                            <CardTitle className="text-xl">{group.title}</CardTitle>
                          </CardHeader>
                          <CardContent className={cn("min-w-0 space-y-4", reportBodyTextClass)}>
                            {group.items.length > 0 ? (
                              group.items.map((item, index) => (
                                <div
                                  key={`${group.title}-${index}`}
                                  className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4"
                                >
                                  <p>{item.summary}</p>
                                  <div className="mt-3 min-w-0">
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
                                compact={isBuildingReport}
                              />
                            )}
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                ) : (
                  <EmptySection
                    title="Research summary pending"
                    description="This section appears after external enrichment and fact-base synthesis finish."
                    compact={isBuildingReport}
                  />
                )}

                <Card className="min-w-0 overflow-hidden border-strong/70 bg-card/80 shadow-none">
                  <CardHeader>
                    <CardTitle className="text-2xl">Fact base</CardTitle>
                  </CardHeader>
                  <CardContent className={cn("min-w-0 space-y-4", reportBodyTextClass)}>
                    {canonicalReport && factBase.length > 0 ? (
                      factBase.map((fact, index) => (
                        <div
                          key={`${fact.statement}-${index}`}
                          className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4"
                        >
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
                              {fact.confidence.confidence_score}/100 confidence
                            </Badge>
                            <Badge variant="outline" className="rounded-full px-3 py-1 capitalize">
                              {fact.confidence.confidence_band}
                            </Badge>
                          </div>
                          <p className="mt-3 text-base leading-7 text-foreground">{fact.statement}</p>
                          {fact.why_it_matters ? (
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">{fact.why_it_matters}</p>
                          ) : null}
                          <div className="mt-3 min-w-0">
                            <EvidencePills
                              sourceIds={canonicalCitationSourceIds(fact.citations)}
                              sources={document.sources}
                              onSelectSources={handleSelectSources}
                            />
                          </div>
                        </div>
                      ))
                    ) : document.facts.length > 0 ? (
                      document.facts.map((fact) => (
                        <div
                          key={fact.id}
                          className="min-w-0 overflow-hidden rounded-3xl border border-border/70 bg-background/70 p-4"
                        >
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
                            <div className="mt-3 overflow-hidden rounded-3xl border border-border/70 bg-card/80 p-4 text-sm leading-7 text-muted-foreground">
                              {fact.evidenceSnippet}
                            </div>
                          ) : null}
                          <div className="mt-3 min-w-0">
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
                        description={
                          canonicalReport
                            ? "No additional fact-base items were stored for this report."
                            : "Claims appear here after the run normalizes source-backed facts and labels them clearly."
                        }
                        compact={isBuildingReport}
                      />
                    )}
                  </CardContent>
                </Card>
              </ReportSection>

              <ReportSection
                id="sources"
                eyebrow="Evidence"
                title="Sources"
                description="Every citation in this brief resolves to a persisted source from this run."
              >
                {document.sources.length > 0 ? (
                  <div className="grid gap-4">
                    {document.sources.map((source) => (
                      <Card key={source.id} className="border-strong/70 bg-card/80 shadow-none">
                        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                          <div className={cn("min-w-0 flex-1 space-y-3.5", reportBodyTextClass)}>
                            <div className="flex flex-wrap items-center gap-2.5">
                              <Badge variant="secondary" className="rounded-full px-3 py-1">
                                Source {getDisplaySourceId(source)}
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
                            <p>
                              {source.summary ?? "No normalized source summary is available yet for this item."}
                            </p>
                            <div className="flex flex-wrap gap-2.5 text-xs text-muted-foreground">
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
                    description="Source records appear here once the saved brief includes cited evidence."
                    compact={isBuildingReport}
                  />
                )}
              </ReportSection>
            </>
          ) : null}

          {reportMode === "build" ? (
            <ReportSection
              id="build-details"
              eyebrow="Report details"
              title="Report details"
              description="Run status, updates, and export availability stay here without leading the seller reading path."
            >
              {showHardFailureState ? (
                <Card className="border-destructive/20 bg-destructive/5 shadow-panel">
                  <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 font-medium text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        Report build failed
                      </div>
                      <p className="max-w-2xl text-sm leading-6 text-destructive sm:leading-7">
                        {normalizeVisibleCopy(currentRun?.errorMessage ?? currentRun?.statusMessage ?? "The latest run failed.")}
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

              {showCompactPendingSections ? (
                pendingSectionTargets.length > 0 || pendingSourceTarget ? (
                  <div className="space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">Sections in progress</div>
                      <div className="text-xs text-muted-foreground">Refreshing automatically</div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {pendingSectionTargets.map((section) => (
                        <Card
                          key={section.id}
                          id={section.id}
                          className="scroll-mt-32 border-border/60 bg-background/70 shadow-none"
                        >
                          <CardContent className="space-y-2 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="font-medium text-foreground">{section.label}</div>
                              <Badge className="rounded-full px-3 py-1" variant="outline">
                                {section.readyCount > 0 ? (
                                  `${section.readyCount}/${section.totalCount}`
                                ) : (
                                  <>
                                    <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />
                                    In progress
                                  </>
                                )}
                              </Badge>
                            </div>
                            <p className="text-sm leading-6 text-foreground/70">{section.pendingDescription}</p>
                          </CardContent>
                        </Card>
                      ))}
                      {pendingSourceTarget ? (
                        <Card
                          id={pendingSourceTarget.id}
                          className="scroll-mt-32 border-border/60 bg-background/70 shadow-none"
                        >
                          <CardContent className="space-y-2 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="font-medium text-foreground">{pendingSourceTarget.label}</div>
                              <Badge className="rounded-full px-3 py-1" variant="outline">
                                <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />
                                In progress
                              </Badge>
                            </div>
                            <p className="text-sm leading-6 text-foreground/70">{pendingSourceTarget.pendingDescription}</p>
                          </CardContent>
                        </Card>
                      ) : null}
                    </div>
                  </div>
                ) : null
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {document.sectionAssessments.map((section) => (
                    <Card key={section.key} className="border-strong/70 bg-card/75 shadow-none">
                      <CardContent className="space-y-3 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">{section.label}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              {section.completenessLabel}
                            </div>
                          </div>
                          <Badge
                            className="rounded-full px-3 py-1"
                            variant={section.status === "ready" ? "secondary" : "outline"}
                          >
                            {section.confidence !== null ? `${section.confidence}/100` : "Pending"}
                          </Badge>
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground sm:leading-7">
                          {section.confidenceRationale
                            ? normalizeVisibleCopy(section.confidenceRationale)
                            : "Section confidence will be scored once evidence reaches this part of the report."}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <ReportStatusPanel status={status} isPolling={isPolling} errorMessage={errorMessage} />
            </ReportSection>
          ) : null}
        </div>

        {showDesktopSourceRail ? (
          <div className="hidden xl:block">
            <div className="fixed right-6 top-28 z-30 h-[calc(100vh-8rem)] w-[18rem] overflow-y-auto">
              <ReportSourcePanel
                sources={document.sources}
                selectedSourceIds={selectedSourceIds}
                onClose={() => {
                  setSelectedSourceIds([]);
                  setIsMobileSourcePanelOpen(false);
                }}
                showCloseButton
              />
            </div>
          </div>
        ) : null}
      </Container>

      {isMobileSourcePanelOpen && showDesktopSourceRail ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setIsMobileSourcePanelOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[2rem] bg-panel p-4">
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
