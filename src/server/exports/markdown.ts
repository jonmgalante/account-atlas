import "server-only";

import { REPORT_SECTION_DEFINITIONS } from "@/lib/report-sections";
import type { ReportExportViewModel } from "@/server/exports/view-model";

function renderCitationLabels(labels: string[]) {
  if (!labels.length) {
    return "";
  }

  return ` ${labels.map((label) => `[${label}]`).join(" ")}`;
}

function pushList(lines: string[], items: string[], emptyMessage = "- None noted.") {
  if (!items.length) {
    lines.push(emptyMessage);
    return;
  }

  for (const item of items) {
    lines.push(`- ${item}`);
  }
}

function escapeTableValue(value: string | null) {
  return (value ?? "Pending").replaceAll("|", "\\|");
}

export function serializeReportToMarkdown(model: ReportExportViewModel) {
  const lines: string[] = [];
  const factsBySection = new Map(
    REPORT_SECTION_DEFINITIONS.map((section) => [
      section.key,
      model.facts.filter((fact) => fact.sectionKey === section.key).slice(0, 3),
    ]),
  );

  lines.push(`# ${model.reportTitle}`);
  lines.push("");
  lines.push(`- Share ID: \`${model.shareId}\``);
  lines.push(`- Company URL: ${model.inputUrl}`);
  lines.push(`- Canonical domain: ${model.canonicalDomain}`);
  lines.push(`- Run started: ${model.runStartedAt}`);
  lines.push("");

  if (model.thinEvidenceWarnings.length > 0) {
    lines.push("> Thin-evidence warnings");

    for (const warning of model.thinEvidenceWarnings) {
      lines.push(`> ${warning.title}: ${warning.message}${renderCitationLabels(warning.citationLabels)}`);
    }

    lines.push("");
  }

  lines.push("## Overview");
  lines.push("");
  if (model.publishMode === "grounded_fallback") {
    lines.push(`- Publish mode: **Grounded fallback brief**`);
    lines.push(
      `- Grounded brief summary: ${model.groundedFallbackBrief.summary ?? "No grounded fallback summary was persisted."}${renderCitationLabels(model.groundedFallbackBrief.citationLabels)}`,
    );

    if (model.groundedFallbackBrief.opportunityHypothesisNote) {
      lines.push(`- Opportunity hypothesis note: ${model.groundedFallbackBrief.opportunityHypothesisNote}`);
    }
  } else {
    lines.push(`- Overall motion: **${model.overallMotion.label}**${renderCitationLabels(model.overallMotion.citationLabels)}`);
    lines.push(`- Motion rationale: ${model.overallMotion.rationale}`);
  }
  lines.push(`- Research completeness: ${model.researchCompletenessScore ?? "Pending"}`);
  lines.push(`- Overall confidence: ${model.overallConfidence ?? "Pending"}`);
  lines.push(`- Company archetype: ${model.companyIdentity.archetype ?? "Pending"}${renderCitationLabels(model.companyIdentity.citationLabels)}`);
  lines.push(`- Business model: ${model.companyIdentity.businessModel ?? "Pending"}`);
  lines.push(`- Industry: ${model.companyIdentity.industry ?? "Pending"}`);
  lines.push(`- Headquarters: ${model.companyIdentity.headquarters ?? "Pending"}`);
  lines.push(
    `- Public company: ${
      model.companyIdentity.publicCompany === null
        ? "Unknown"
        : model.companyIdentity.publicCompany
          ? "Yes"
          : "No"
    }`,
  );
  lines.push("");
  lines.push("### Section confidence");
  lines.push("");
  lines.push("| Section | Completeness | Confidence | Rationale |");
  lines.push("| --- | --- | --- | --- |");

  for (const section of model.sectionAssessments) {
    lines.push(
      `| ${section.label} | ${section.completenessLabel} | ${section.confidence === null ? "Pending" : `${section.confidence}/100`} | ${escapeTableValue(section.confidenceRationale)} |`,
    );
  }

  lines.push("");
  lines.push("## Research");
  lines.push("");
  lines.push(`### Growth priorities`);
  lines.push("");

  if (model.growthPriorities.length > 0) {
    for (const item of model.growthPriorities) {
      lines.push(`- ${item.summary}${renderCitationLabels(item.citationLabels)}`);
    }
  } else {
    lines.push("- No confident growth priorities were established from public evidence.");
  }

  lines.push("");
  lines.push("### Signal summary");
  lines.push("");
  lines.push(
    `- AI maturity: ${model.aiMaturityEstimate.level ?? "Pending"}${model.aiMaturityEstimate.rationale ? ` - ${model.aiMaturityEstimate.rationale}` : ""}${renderCitationLabels(model.aiMaturityEstimate.citationLabels)}`,
  );
  lines.push(
    `- Regulatory sensitivity: ${model.regulatorySensitivity.level ?? "Pending"}${model.regulatorySensitivity.rationale ? ` - ${model.regulatorySensitivity.rationale}` : ""}${renderCitationLabels(model.regulatorySensitivity.citationLabels)}`,
  );
  lines.push("");

  for (const [label, items] of [
    ["Product signals", model.notableProductSignals],
    ["Hiring signals", model.notableHiringSignals],
    ["Trust signals", model.notableTrustSignals],
    ["Complaint themes", model.complaintThemes],
    ["Leadership and social themes", model.leadershipSocialThemes],
  ] as const) {
    lines.push(`### ${label}`);
    lines.push("");

    if (items.length > 0) {
      for (const item of items) {
        lines.push(`- ${item.summary}${renderCitationLabels(item.citationLabels)}`);
      }
    } else {
      lines.push("- No confident summary was established for this signal cluster.");
    }

    lines.push("");
  }

  lines.push("### Facts, inferences, and hypotheses");
  lines.push("");

  for (const section of REPORT_SECTION_DEFINITIONS) {
    const facts = factsBySection.get(section.key) ?? [];

    lines.push(`#### ${section.label}`);
    lines.push("");

    if (facts.length === 0) {
      lines.push("- No persisted fact-base entries for this section yet.");
      lines.push("");
      continue;
    }

    for (const fact of facts) {
      lines.push(
        `- **${fact.classification.toUpperCase()}**: ${fact.statement}${renderCitationLabels(fact.citationLabels)}`,
      );
      lines.push(
        `  Confidence ${fact.confidence}/100; freshness ${fact.freshness}; sentiment ${fact.sentiment}; relevance ${fact.relevance}/100.`,
      );

      if (fact.rationale) {
        lines.push(`  Rationale: ${fact.rationale}`);
      }
    }

    lines.push("");
  }

  lines.push(model.publishMode === "grounded_fallback" ? "## Opportunity Hypotheses" : "## Use Cases");
  lines.push("");
  lines.push(model.publishMode === "grounded_fallback" ? "### Grounded hypotheses" : "### Top 3 prioritized");
  lines.push("");

  if (model.topUseCases.length > 0) {
    for (const useCase of model.topUseCases) {
      lines.push(`#### ${useCase.priorityRank}. ${useCase.workflowName}`);
      lines.push("");
      lines.push(`- Department: ${useCase.departmentLabel}`);
      lines.push(`- Recommended motion: ${useCase.recommendedMotionLabel}`);
      lines.push(`- Priority score: ${useCase.priorityScore.toFixed(1)}`);
      lines.push(`- Pain point: ${useCase.painPoint}`);
      lines.push(`- Why now: ${useCase.whyNow}`);
      lines.push(`- Likely users: ${useCase.likelyUsers.join(", ") || "Pending"}`);
      lines.push(`- Expected outcome: ${useCase.expectedOutcome}`);
      lines.push(`- Evidence: ${useCase.citationLabels.length ? useCase.citationLabels.map((label) => `[${label}]`).join(" ") : "No persisted citations"}`);
      lines.push("");
      lines.push("Scorecard:");
      lines.push(
        `- business_value ${useCase.scorecard.businessValue}; deployment_readiness ${useCase.scorecard.deploymentReadiness}; expansion_potential ${useCase.scorecard.expansionPotential}; openai_fit ${useCase.scorecard.openaiFit}; sponsor_likelihood ${useCase.scorecard.sponsorLikelihood}; evidence_confidence ${useCase.scorecard.evidenceConfidence}; risk_penalty ${useCase.scorecard.riskPenalty}; priority_score ${useCase.scorecard.priorityScore.toFixed(1)}`,
      );
      lines.push("");
      lines.push("Dependencies:");
      pushList(lines, useCase.dependencies);
      lines.push("");
      lines.push("Security/compliance notes:");
      pushList(lines, useCase.securityComplianceNotes);
      lines.push("");
      lines.push("Open questions:");
      pushList(lines, useCase.openQuestions);
      lines.push("");
    }
  } else {
    lines.push(
      model.publishMode === "grounded_fallback"
        ? "No grounded opportunity hypotheses met the minimum evidence bar for this run."
        : "No prioritized use cases were persisted for this run.",
    );
    lines.push("");
  }

  lines.push(model.publishMode === "grounded_fallback" ? "### Full hypothesis set" : "### Full candidate set");
  lines.push("");

  if (model.candidateUseCases.length > 0) {
    lines.push("| Rank | Workflow | Department | Motion | Priority score | Evidence |");
    lines.push("| --- | --- | --- | --- | --- | --- |");

    for (const useCase of model.candidateUseCases) {
      lines.push(
        `| ${useCase.priorityRank} | ${escapeTableValue(useCase.workflowName)} | ${escapeTableValue(useCase.departmentLabel)} | ${escapeTableValue(useCase.recommendedMotionLabel)} | ${useCase.priorityScore.toFixed(1)} | ${escapeTableValue(useCase.citationLabels.join(", "))} |`,
      );
    }
  } else {
    lines.push("- No candidate use cases were persisted for this run.");
  }

  lines.push("");
  lines.push("## Stakeholders");
  lines.push("");

  if (model.stakeholders.length > 0) {
    for (const stakeholder of model.stakeholders) {
      lines.push(`- **${stakeholder.likelyRole}**${stakeholder.department ? ` (${stakeholder.department})` : ""}${renderCitationLabels(stakeholder.citationLabels)}`);
      lines.push(`  Hypothesis: ${stakeholder.hypothesis}`);
      lines.push(`  Rationale: ${stakeholder.rationale}`);
      lines.push(`  Confidence: ${stakeholder.confidence}/100`);
    }
  } else {
    lines.push("- No stakeholder hypotheses were persisted for this run.");
  }

  lines.push("");
  lines.push("## Pilot Plan");
  lines.push("");

  if (model.pilotPlan) {
    lines.push(`- Objective: ${model.pilotPlan.objective}${renderCitationLabels(model.pilotPlan.citationLabels)}`);
    lines.push(`- Recommended motion: ${model.pilotPlan.recommendedMotionLabel}`);
    lines.push(`- Scope: ${model.pilotPlan.scope}`);
    lines.push("");
    lines.push("Success metrics:");
    pushList(lines, model.pilotPlan.successMetrics);
    lines.push("");
    lines.push("Phases:");

    for (const phase of model.pilotPlan.phases) {
      lines.push(`- ${phase.name} (${phase.duration})`);
      lines.push(`  Goals: ${phase.goals.join("; ") || "Pending"}`);
      lines.push(`  Deliverables: ${phase.deliverables.join("; ") || "Pending"}`);
    }

    lines.push("");
    lines.push("Dependencies:");
    pushList(lines, model.pilotPlan.dependencies);
    lines.push("");
    lines.push("Risks:");
    pushList(lines, model.pilotPlan.risks);
  } else {
    lines.push("- No pilot plan was persisted for this run.");
  }

  lines.push("");
  lines.push("## Expansion Scenarios");
  lines.push("");

  for (const [label, scenario] of [
    ["Low", model.expansionScenarios.low],
    ["Base", model.expansionScenarios.base],
    ["High", model.expansionScenarios.high],
  ] as const) {
    lines.push(`### ${label}`);
    lines.push("");

    if (!scenario) {
      lines.push("- No scenario was persisted for this case.");
      lines.push("");
      continue;
    }

    lines.push(`- Summary: ${scenario.summary}${renderCitationLabels(scenario.citationLabels)}`);
    lines.push("Assumptions:");
    pushList(lines, scenario.assumptions);
    lines.push("");
    lines.push("Expected outcomes:");
    pushList(lines, scenario.expectedOutcomes);
    lines.push("");
  }

  lines.push("## Objections and Discovery Questions");
  lines.push("");
  lines.push("### Objections");
  lines.push("");

  if (model.objectionsAndRebuttals.length > 0) {
    for (const item of model.objectionsAndRebuttals) {
      lines.push(`- Objection: ${item.objection}${renderCitationLabels(item.citationLabels)}`);
      lines.push(`  Rebuttal: ${item.rebuttal}`);
    }
  } else {
    lines.push("- No objections were persisted for this run.");
  }

  lines.push("");
  lines.push("### Discovery questions");
  lines.push("");

  if (model.discoveryQuestions.length > 0) {
    for (const item of model.discoveryQuestions) {
      lines.push(`- ${item.question}${renderCitationLabels(item.citationLabels)}`);
      lines.push(`  Why it matters: ${item.whyItMatters}`);
    }
  } else {
    lines.push("- No discovery questions were persisted for this run.");
  }

  lines.push("");
  lines.push("## Sources");
  lines.push("");

  if (model.citations.length > 0) {
    for (const source of model.citations) {
      lines.push(`### [${source.label}] ${source.title}`);
      lines.push("");
      lines.push(`- URL: ${source.url}`);
      lines.push(`- Type: ${source.sourceTypeLabel}`);
      lines.push(`- Tier: ${source.sourceTier}`);
      lines.push(`- MIME type: ${source.mimeType ?? "Unknown"}`);
      lines.push(`- Published: ${source.publishedAt ?? "Unknown"}`);
      lines.push(`- Retrieved: ${source.retrievedAt ?? "Unknown"}`);

      if (source.summary) {
        lines.push(`- Summary: ${source.summary}`);
      }

      lines.push("");
    }
  } else {
    lines.push("No sources were persisted for this run.");
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
