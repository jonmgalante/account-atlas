import "server-only";

import { REPORT_SECTION_DEFINITIONS } from "@/lib/report-sections";
import type { ReportExportViewModel } from "@/server/exports/view-model";

function renderCitationLabels(labels: string[]) {
  if (!labels.length) {
    return "";
  }

  return ` ${labels.map((label) => `[${label}]`).join(" ")}`;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pushSection(lines: string[], title: string) {
  if (lines.length > 0 && lines.at(-1) !== "") {
    lines.push("");
  }

  lines.push(title);
  lines.push("");
}

function pushList(lines: string[], items: string[]) {
  for (const item of items) {
    lines.push(`- ${item}`);
  }
}

function pushLabeledList(lines: string[], label: string, items: string[]) {
  if (!items.length) {
    return;
  }

  lines.push(`**${label}**`);
  pushList(lines, items);
  lines.push("");
}

function escapeTableValue(value: string | null) {
  return (value ?? "").replaceAll("|", "\\|");
}

function formatPublicCompany(value: boolean | null) {
  if (value === null) {
    return "Unknown";
  }

  return value ? "Yes" : "No";
}

function formatConfidenceBand(value: string | null) {
  if (!value) {
    return "Not specified";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getCompanyBriefFact(model: ReportExportViewModel) {
  return model.facts.find((fact) => fact.sectionKey === "company-brief") ?? null;
}

function getCoverageNotes(model: ReportExportViewModel) {
  return model.sectionAssessments.filter(
    (section) => section.status !== "ready" || (section.confidence !== null && section.confidence < 75),
  );
}

function hasExpansionScenario(model: ReportExportViewModel) {
  return Boolean(model.expansionScenarios.low || model.expansionScenarios.base || model.expansionScenarios.high);
}

function pushExecutiveSummary(lines: string[], model: ReportExportViewModel) {
  pushSection(lines, "## Executive summary");

  const companyBrief = getCompanyBriefFact(model);

  if (companyBrief) {
    lines.push(`- ${companyBrief.statement}${renderCitationLabels(companyBrief.citationLabels)}`);
  }

  for (const item of model.growthPriorities.slice(0, 2)) {
    lines.push(`- ${item.summary}${renderCitationLabels(item.citationLabels)}`);
  }

  if (model.publishMode === "grounded_fallback") {
    if (hasText(model.groundedFallbackBrief.summary)) {
      lines.push(
        `- Grounded brief: ${model.groundedFallbackBrief.summary}${renderCitationLabels(model.groundedFallbackBrief.citationLabels)}`,
      );
    }

    if (hasText(model.groundedFallbackBrief.opportunityHypothesisNote)) {
      lines.push(`- Opportunity note: ${model.groundedFallbackBrief.opportunityHypothesisNote}`);
    }
  } else {
    lines.push(
      `- Recommended motion: **${model.overallMotion.label}**. ${model.overallMotion.rationale}${renderCitationLabels(model.overallMotion.citationLabels)}`,
    );
  }

  const topUseCase = model.topUseCases[0] ?? null;

  if (topUseCase) {
    lines.push(
      `- Highest-priority opportunity: **${topUseCase.workflowName}**. ${topUseCase.summary}${renderCitationLabels(topUseCase.citationLabels)}`,
    );
  }
}

function pushCompanySnapshot(lines: string[], model: ReportExportViewModel) {
  const snapshotLines: string[] = [];

  if (hasText(model.companyIdentity.archetype)) {
    snapshotLines.push(`- Archetype: ${model.companyIdentity.archetype}${renderCitationLabels(model.companyIdentity.citationLabels)}`);
  }

  if (hasText(model.companyIdentity.businessModel)) {
    snapshotLines.push(`- Business model: ${model.companyIdentity.businessModel}`);
  }

  if (hasText(model.companyIdentity.industry)) {
    snapshotLines.push(`- Industry: ${model.companyIdentity.industry}`);
  }

  if (hasText(model.companyIdentity.headquarters)) {
    snapshotLines.push(`- Headquarters: ${model.companyIdentity.headquarters}`);
  }

  snapshotLines.push(`- Public company: ${formatPublicCompany(model.companyIdentity.publicCompany)}`);

  if (hasText(model.aiMaturityEstimate.level)) {
    snapshotLines.push(
      `- AI maturity: ${model.aiMaturityEstimate.level}${model.aiMaturityEstimate.rationale ? ` - ${model.aiMaturityEstimate.rationale}` : ""}${renderCitationLabels(model.aiMaturityEstimate.citationLabels)}`,
    );
  }

  if (hasText(model.regulatorySensitivity.level)) {
    snapshotLines.push(
      `- Regulatory sensitivity: ${model.regulatorySensitivity.level}${model.regulatorySensitivity.rationale ? ` - ${model.regulatorySensitivity.rationale}` : ""}${renderCitationLabels(model.regulatorySensitivity.citationLabels)}`,
    );
  }

  if (!snapshotLines.length) {
    return;
  }

  pushSection(lines, "## Company snapshot");
  lines.push(...snapshotLines);
}

function pushRecommendedMotion(lines: string[], model: ReportExportViewModel) {
  pushSection(lines, model.publishMode === "grounded_fallback" ? "## Grounded brief" : "## Recommended motion");

  if (model.publishMode === "grounded_fallback") {
    if (hasText(model.groundedFallbackBrief.summary)) {
      lines.push(`${model.groundedFallbackBrief.summary}${renderCitationLabels(model.groundedFallbackBrief.citationLabels)}`);
      lines.push("");
    }

    if (hasText(model.groundedFallbackBrief.opportunityHypothesisNote)) {
      lines.push(model.groundedFallbackBrief.opportunityHypothesisNote);
      lines.push("");
    }

    return;
  }

  lines.push(`**${model.overallMotion.label}**${renderCitationLabels(model.overallMotion.citationLabels)}`);
  lines.push("");
  lines.push(model.overallMotion.rationale);
  lines.push("");
}

function pushTopUseCases(lines: string[], model: ReportExportViewModel) {
  if (!model.topUseCases.length) {
    return;
  }

  pushSection(lines, model.publishMode === "grounded_fallback" ? "## Opportunity hypotheses" : "## Top 3 opportunities");

  for (const useCase of model.topUseCases) {
    lines.push(`### ${useCase.priorityRank}. ${useCase.workflowName}`);
    lines.push("");
    lines.push(`${useCase.summary}${renderCitationLabels(useCase.citationLabels)}`);
    lines.push("");
    lines.push(`- Department: ${useCase.departmentLabel}`);
    lines.push(`- Recommended motion: ${useCase.recommendedMotionLabel}`);
    lines.push(`- Pain point: ${useCase.painPoint}`);
    lines.push(`- Why now: ${useCase.whyNow}`);

    if (useCase.likelyUsers.length) {
      lines.push(`- Likely users: ${useCase.likelyUsers.join(", ")}`);
    }

    lines.push(`- Expected outcome: ${useCase.expectedOutcome}`);

    if (useCase.metrics.length) {
      lines.push(`- Success metrics: ${useCase.metrics.join("; ")}`);
    }

    if (useCase.dependencies.length) {
      lines.push(`- Dependencies: ${useCase.dependencies.join("; ")}`);
    }

    if (useCase.securityComplianceNotes.length) {
      lines.push(`- Security / compliance notes: ${useCase.securityComplianceNotes.join("; ")}`);
    }

    if (useCase.openQuestions.length) {
      lines.push(`- Open questions: ${useCase.openQuestions.join("; ")}`);
    }

    lines.push("");
  }
}

function pushPilotPlan(lines: string[], model: ReportExportViewModel) {
  if (!model.pilotPlan) {
    return;
  }

  pushSection(lines, "## 90-day pilot plan");
  lines.push(`**Objective:** ${model.pilotPlan.objective}${renderCitationLabels(model.pilotPlan.citationLabels)}`);
  lines.push("");
  lines.push(`- Recommended motion: ${model.pilotPlan.recommendedMotionLabel}`);
  lines.push(`- Scope: ${model.pilotPlan.scope}`);

  if (model.pilotPlan.successMetrics.length) {
    lines.push("");
    pushLabeledList(lines, "Success metrics", model.pilotPlan.successMetrics);
  }

  if (model.pilotPlan.phases.length) {
    lines.push("**Phases**");

    for (const phase of model.pilotPlan.phases) {
      lines.push(`- ${phase.name} (${phase.duration})`);

      if (phase.goals.length) {
        lines.push(`  Goals: ${phase.goals.join("; ")}`);
      }

      if (phase.deliverables.length) {
        lines.push(`  Deliverables: ${phase.deliverables.join("; ")}`);
      }
    }

    lines.push("");
  }

  pushLabeledList(lines, "Dependencies", model.pilotPlan.dependencies);
  pushLabeledList(lines, "Risks", model.pilotPlan.risks);
}

function pushExpansionScenarios(lines: string[], model: ReportExportViewModel) {
  if (!hasExpansionScenario(model)) {
    return;
  }

  pushSection(lines, "## Expansion scenarios");

  for (const [label, scenario] of [
    ["Low", model.expansionScenarios.low],
    ["Base", model.expansionScenarios.base],
    ["High", model.expansionScenarios.high],
  ] as const) {
    if (!scenario) {
      continue;
    }

    lines.push(`### ${label}`);
    lines.push("");
    lines.push(`${scenario.summary}${renderCitationLabels(scenario.citationLabels)}`);
    lines.push("");
    pushLabeledList(lines, "Assumptions", scenario.assumptions);
    pushLabeledList(lines, "Expected outcomes", scenario.expectedOutcomes);
  }
}

function pushStakeholders(lines: string[], model: ReportExportViewModel) {
  if (!model.stakeholders.length) {
    return;
  }

  pushSection(lines, "## Stakeholder hypotheses");

  for (const stakeholder of model.stakeholders) {
    lines.push(`### ${stakeholder.likelyRole}${stakeholder.department ? ` (${stakeholder.department})` : ""}`);
    lines.push("");
    lines.push(`- Hypothesis: ${stakeholder.hypothesis}${renderCitationLabels(stakeholder.citationLabels)}`);
    lines.push(`- Why this role matters: ${stakeholder.rationale}`);
    lines.push(`- Confidence: ${stakeholder.confidence}/100`);
    lines.push("");
  }
}

function pushObjectionsAndDiscovery(lines: string[], model: ReportExportViewModel) {
  if (!model.objectionsAndRebuttals.length && !model.discoveryQuestions.length) {
    return;
  }

  pushSection(lines, "## Objections and discovery questions");

  if (model.objectionsAndRebuttals.length) {
    lines.push("### Likely objections");
    lines.push("");

    for (const item of model.objectionsAndRebuttals) {
      lines.push(`- **Objection:** ${item.objection}${renderCitationLabels(item.citationLabels)}`);
      lines.push(`  **Response:** ${item.rebuttal}`);
    }

    lines.push("");
  }

  if (model.discoveryQuestions.length) {
    lines.push("### Discovery questions");
    lines.push("");

    for (const item of model.discoveryQuestions) {
      lines.push(`- ${item.question}${renderCitationLabels(item.citationLabels)}`);
      lines.push(`  Why it matters: ${item.whyItMatters}`);
    }

    lines.push("");
  }
}

function pushEvidenceAndCaveats(lines: string[], model: ReportExportViewModel) {
  pushSection(lines, "## Evidence and caveats");
  lines.push(
    `- Evidence coverage: ${model.researchCompletenessScore === null ? "Not specified" : `${model.researchCompletenessScore}/100`}`,
  );
  lines.push(`- Overall confidence: ${formatConfidenceBand(model.overallConfidence)}`);

  for (const warning of model.thinEvidenceWarnings) {
    lines.push(`- ${warning.title}: ${warning.message}${renderCitationLabels(warning.citationLabels)}`);
  }

  const coverageNotes = getCoverageNotes(model).slice(0, 4);

  if (coverageNotes.length) {
    lines.push(
      `- Areas to validate in discovery: ${coverageNotes
        .map((section) => `${section.label} (${section.completenessLabel.toLowerCase()})`)
        .join("; ")}`,
    );
  }
}

function pushSupportingEvidence(lines: string[], model: ReportExportViewModel) {
  if (!model.facts.length) {
    return;
  }

  pushSection(lines, "## Supporting evidence notes");

  for (const section of REPORT_SECTION_DEFINITIONS) {
    const facts = model.facts.filter((fact) => fact.sectionKey === section.key);

    if (!facts.length) {
      continue;
    }

    lines.push(`### ${section.label}`);
    lines.push("");

    for (const fact of facts) {
      lines.push(`- **${fact.classification.toUpperCase()}**: ${fact.statement}${renderCitationLabels(fact.citationLabels)}`);

      if (hasText(fact.rationale)) {
        lines.push(`  Why it matters: ${fact.rationale}`);
      }
    }

    lines.push("");
  }
}

function pushFullOpportunitySet(lines: string[], model: ReportExportViewModel) {
  if (!model.candidateUseCases.length) {
    return;
  }

  pushSection(lines, "## Full opportunity set");
  lines.push("| Rank | Workflow | Department | Motion | Priority score | Evidence |");
  lines.push("| --- | --- | --- | --- | --- | --- |");

  for (const useCase of model.candidateUseCases) {
    lines.push(
      `| ${useCase.priorityRank} | ${escapeTableValue(useCase.workflowName)} | ${escapeTableValue(useCase.departmentLabel)} | ${escapeTableValue(useCase.recommendedMotionLabel)} | ${useCase.priorityScore.toFixed(1)} | ${escapeTableValue(useCase.citationLabels.join(", "))} |`,
    );
  }
}

function pushReportMetadata(lines: string[], model: ReportExportViewModel) {
  pushSection(lines, "## Report metadata");
  lines.push(`- Share ID: \`${model.shareId}\``);
  lines.push(`- Company URL: ${model.inputUrl}`);
  lines.push(`- Canonical domain: ${model.canonicalDomain}`);
  lines.push(`- Run started: ${model.runStartedAt}`);
}

function pushSources(lines: string[], model: ReportExportViewModel) {
  pushSection(lines, "## Source appendix");

  if (!model.citations.length) {
    lines.push("No sources were preserved for this export.");
    lines.push("");
    return;
  }

  for (const source of model.citations) {
    lines.push(`### [${source.label}] ${source.title}`);
    lines.push("");
    lines.push(`- URL: ${source.url}`);
    lines.push(`- Source type: ${source.sourceTypeLabel}`);
    lines.push(`- Evidence tier: ${source.sourceTier}`);

    if (source.publishedAt) {
      lines.push(`- Published: ${source.publishedAt}`);
    }

    if (source.retrievedAt) {
      lines.push(`- Retrieved: ${source.retrievedAt}`);
    }

    if (source.summary) {
      lines.push(`- Summary: ${source.summary}`);
    }

    lines.push("");
  }
}

export function serializeReportToMarkdown(model: ReportExportViewModel) {
  const lines: string[] = [];

  lines.push(`# ${model.companyName}`);
  lines.push("");
  lines.push("_Account Atlas account brief_");
  lines.push("");
  lines.push("Evidence-backed public account plan.");

  pushExecutiveSummary(lines, model);
  pushCompanySnapshot(lines, model);
  pushRecommendedMotion(lines, model);
  pushTopUseCases(lines, model);
  pushPilotPlan(lines, model);
  pushExpansionScenarios(lines, model);
  pushStakeholders(lines, model);
  pushObjectionsAndDiscovery(lines, model);
  pushEvidenceAndCaveats(lines, model);
  pushSupportingEvidence(lines, model);
  pushFullOpportunitySet(lines, model);
  pushReportMetadata(lines, model);
  pushSources(lines, model);

  return `${lines.join("\n").trimEnd()}\n`;
}
