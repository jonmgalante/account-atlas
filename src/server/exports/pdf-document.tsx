import "server-only";

import React from "react";
import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { ReportExportViewModel } from "@/server/exports/view-model";

const styles = StyleSheet.create({
  page: {
    paddingTop: 52,
    paddingBottom: 40,
    paddingHorizontal: 38,
    fontSize: 10.5,
    lineHeight: 1.5,
    color: "#14213d",
    fontFamily: "Helvetica",
  },
  fixedHeader: {
    position: "absolute",
    top: 20,
    left: 38,
    right: 38,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#d9e1ec",
    paddingBottom: 8,
  },
  brand: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#3a506b",
  },
  headerMeta: {
    fontSize: 8.5,
    color: "#6b7280",
  },
  coverTitle: {
    fontSize: 23,
    fontWeight: 700,
    marginTop: 24,
    color: "#0f172a",
  },
  coverSubtitle: {
    fontSize: 11.5,
    marginTop: 10,
    color: "#475569",
    lineHeight: 1.55,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#d9e1ec",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 9,
    color: "#334155",
    backgroundColor: "#f8fafc",
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontSize: 10,
    color: "#64748b",
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: "#d9e1ec",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    flexGrow: 1,
  },
  cardTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "#0f172a",
  },
  cardBody: {
    marginTop: 5,
    color: "#475569",
  },
  statValue: {
    marginTop: 5,
    fontSize: 16,
    fontWeight: 700,
    color: "#0f172a",
  },
  listItem: {
    marginTop: 6,
    color: "#334155",
  },
  useCaseCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d9e1ec",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#ffffff",
  },
  useCaseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  useCaseTitle: {
    fontSize: 12.5,
    fontWeight: 700,
    color: "#0f172a",
  },
  badge: {
    borderRadius: 999,
    backgroundColor: "#e8eef7",
    color: "#214263",
    fontSize: 8.5,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  paragraph: {
    marginTop: 6,
    color: "#334155",
  },
  splitColumns: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  column: {
    flex: 1,
  },
  label: {
    fontSize: 9.2,
    fontWeight: 700,
    color: "#1e293b",
  },
  smallListItem: {
    marginTop: 4,
    color: "#475569",
  },
  appendixItem: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  appendixTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "#0f172a",
  },
  appendixMeta: {
    marginTop: 4,
    color: "#64748b",
  },
  link: {
    marginTop: 3,
    color: "#235789",
    textDecoration: "none",
  },
});

function renderCitationLabels(labels: string[]) {
  return labels.length ? ` ${labels.map((label) => `[${label}]`).join(" ")}` : "";
}

function renderList(items: string[]) {
  if (!items.length) {
    return <Text style={styles.smallListItem}>None noted.</Text>;
  }

  return items.map((item) => (
    <Text key={item} style={styles.smallListItem}>
      • {item}
    </Text>
  ));
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function hasExpansionScenario(model: ReportExportViewModel) {
  return Boolean(model.expansionScenarios.low || model.expansionScenarios.base || model.expansionScenarios.high);
}

function getCoverageNotes(model: ReportExportViewModel) {
  return model.sectionAssessments.filter(
    (section) => section.status !== "ready" || (section.confidence !== null && section.confidence < 75),
  );
}

function AccountAtlasPdfDocument({ model }: { model: ReportExportViewModel }) {
  const companyBrief = getCompanyBriefFact(model);
  const coverageNotes = getCoverageNotes(model).slice(0, 4);

  return (
    <Document
      title={model.reportTitle}
      author="Account Atlas"
      subject="Evidence-backed enterprise account brief"
      keywords="account atlas, account brief, ai use cases"
    >
      <Page size="LETTER" style={styles.page}>
        <View fixed style={styles.fixedHeader}>
          <Text style={styles.brand}>Account Atlas</Text>
          <Text style={styles.headerMeta}>Account brief</Text>
        </View>

        <Text style={styles.coverTitle}>{model.companyName}</Text>
        <Text style={styles.coverSubtitle}>
          Account Atlas account brief. Evidence-backed public account plan built from public-web research with preserved citations.
        </Text>

        <View style={styles.metaRow}>
          {model.publishMode === "grounded_fallback" ? (
            <Text style={styles.chip}>Grounded brief</Text>
          ) : (
            <Text style={styles.chip}>Recommended motion: {model.overallMotion.label}</Text>
          )}
          <Text style={styles.chip}>Strategic brief first, source appendix last</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive summary</Text>
          <View style={styles.grid}>
            <View style={[styles.card, { width: "48%" }]}>
              <Text style={styles.cardTitle}>Company context</Text>
              {companyBrief ? (
                <Text style={styles.cardBody}>
                  {companyBrief.statement}
                  {renderCitationLabels(companyBrief.citationLabels)}
                </Text>
              ) : null}
              <Text style={styles.cardBody}>
                {model.companyName}
                {model.companyIdentity.archetype ? ` • ${model.companyIdentity.archetype}` : ""}
                {renderCitationLabels(model.companyIdentity.citationLabels)}
              </Text>
              {hasText(model.companyIdentity.businessModel) ? (
                <Text style={styles.cardBody}>Business model: {model.companyIdentity.businessModel}</Text>
              ) : null}
              {hasText(model.companyIdentity.industry) ? (
                <Text style={styles.cardBody}>Industry: {model.companyIdentity.industry}</Text>
              ) : null}
              {hasText(model.companyIdentity.headquarters) ? (
                <Text style={styles.cardBody}>Headquarters: {model.companyIdentity.headquarters}</Text>
              ) : null}
            </View>
            <View style={[styles.card, { width: "48%" }]}>
              <Text style={styles.cardTitle}>Current priorities and posture</Text>
              {model.growthPriorities.length > 0 ? (
                model.growthPriorities.slice(0, 3).map((item) => (
                  <Text key={item.summary} style={styles.listItem}>
                    • {item.summary}
                    {renderCitationLabels(item.citationLabels)}
                  </Text>
                ))
              ) : null}
              {hasText(model.aiMaturityEstimate.level) ? (
                <Text style={styles.cardBody}>
                  AI maturity: {model.aiMaturityEstimate.level}
                  {model.aiMaturityEstimate.rationale ? ` • ${model.aiMaturityEstimate.rationale}` : ""}
                  {renderCitationLabels(model.aiMaturityEstimate.citationLabels)}
                </Text>
              ) : null}
              {hasText(model.regulatorySensitivity.level) ? (
                <Text style={styles.cardBody}>
                  Regulatory sensitivity: {model.regulatorySensitivity.level}
                  {model.regulatorySensitivity.rationale ? ` • ${model.regulatorySensitivity.rationale}` : ""}
                  {renderCitationLabels(model.regulatorySensitivity.citationLabels)}
                </Text>
              ) : null}
              <Text style={styles.cardBody}>Public company: {formatPublicCompany(model.companyIdentity.publicCompany)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {model.publishMode === "grounded_fallback" ? "Grounded brief" : "Recommended motion"}
          </Text>
          <View style={styles.card}>
            {model.publishMode === "grounded_fallback" ? (
              <>
                {hasText(model.groundedFallbackBrief.summary) ? (
                  <Text style={styles.cardBody}>
                    {model.groundedFallbackBrief.summary}
                    {renderCitationLabels(model.groundedFallbackBrief.citationLabels)}
                  </Text>
                ) : null}
                {hasText(model.groundedFallbackBrief.opportunityHypothesisNote) ? (
                  <Text style={styles.cardBody}>{model.groundedFallbackBrief.opportunityHypothesisNote}</Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>{model.overallMotion.label}</Text>
                <Text style={styles.cardBody}>
                  {model.overallMotion.rationale}
                  {renderCitationLabels(model.overallMotion.citationLabels)}
                </Text>
              </>
            )}
          </View>
        </View>

        {model.topUseCases.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {model.publishMode === "grounded_fallback" ? "Opportunity hypotheses" : "Top 3 opportunities"}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {model.publishMode === "grounded_fallback"
                ? "Only grounded hypotheses that still clear the minimum evidence bar are included."
                : "Highest-priority opportunities from the saved brief, with citations preserved."}
            </Text>

            {model.topUseCases.map((useCase) => (
              <View key={`${useCase.priorityRank}-${useCase.workflowName}`} style={styles.useCaseCard}>
                <View style={styles.useCaseHeader}>
                  <Text style={styles.useCaseTitle}>
                    {useCase.priorityRank}. {useCase.workflowName}
                  </Text>
                  <Text style={styles.badge}>{useCase.recommendedMotionLabel}</Text>
                </View>
                <Text style={styles.paragraph}>{useCase.summary}</Text>
                <Text style={styles.paragraph}>
                  Why now: {useCase.whyNow}
                  {renderCitationLabels(useCase.citationLabels)}
                </Text>
                <Text style={styles.paragraph}>Expected outcome: {useCase.expectedOutcome}</Text>
                {useCase.metrics.length > 0 ? (
                  <>
                    <Text style={[styles.label, { marginTop: 8 }]}>Success metrics</Text>
                    {renderList(useCase.metrics)}
                  </>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {model.pilotPlan ? (
          <View wrap={false} style={styles.section}>
            <Text style={styles.sectionTitle}>90-day pilot plan</Text>
            <View style={styles.card}>
              <Text style={styles.cardBody}>
                Objective: {model.pilotPlan.objective}
                {renderCitationLabels(model.pilotPlan.citationLabels)}
              </Text>
              <Text style={styles.cardBody}>Recommended motion: {model.pilotPlan.recommendedMotionLabel}</Text>
              <Text style={styles.cardBody}>Scope: {model.pilotPlan.scope}</Text>
              {model.pilotPlan.successMetrics.length > 0 ? (
                <>
                  <Text style={[styles.label, { marginTop: 8 }]}>Success metrics</Text>
                  {renderList(model.pilotPlan.successMetrics)}
                </>
              ) : null}
              {model.pilotPlan.phases.length > 0 ? (
                <>
                  <Text style={[styles.label, { marginTop: 8 }]}>Phases</Text>
                  {model.pilotPlan.phases.map((phase) => (
                    <Text key={`${phase.name}-${phase.duration}`} style={styles.listItem}>
                      • {phase.name} ({phase.duration}): goals {phase.goals.join("; ") || "Pending"}; deliverables {phase.deliverables.join("; ") || "Pending"}
                    </Text>
                  ))}
                </>
              ) : null}
              {model.pilotPlan.dependencies.length > 0 ? (
                <>
                  <Text style={[styles.label, { marginTop: 8 }]}>Dependencies</Text>
                  {renderList(model.pilotPlan.dependencies)}
                </>
              ) : null}
              {model.pilotPlan.risks.length > 0 ? (
                <>
                  <Text style={[styles.label, { marginTop: 8 }]}>Risks</Text>
                  {renderList(model.pilotPlan.risks)}
                </>
              ) : null}
            </View>
          </View>
        ) : null}
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View fixed style={styles.fixedHeader}>
          <Text style={styles.brand}>Account Atlas</Text>
          <Text style={styles.headerMeta}>{model.companyName}</Text>
        </View>

        {hasExpansionScenario(model) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expansion scenarios</Text>
            {([
              ["Low", model.expansionScenarios.low],
              ["Base", model.expansionScenarios.base],
              ["High", model.expansionScenarios.high],
            ] as const)
              .filter(([, scenario]) => Boolean(scenario))
              .map(([label, scenario]) => (
                <View key={label} style={styles.card}>
                  <Text style={styles.cardTitle}>{label}</Text>
                  <Text style={styles.cardBody}>
                    {scenario?.summary}
                    {scenario ? renderCitationLabels(scenario.citationLabels) : ""}
                  </Text>
                  {scenario ? (
                    <>
                      {scenario.assumptions.length > 0 ? (
                        <>
                          <Text style={[styles.label, { marginTop: 8 }]}>Assumptions</Text>
                          {renderList(scenario.assumptions)}
                        </>
                      ) : null}
                      {scenario.expectedOutcomes.length > 0 ? (
                        <>
                          <Text style={[styles.label, { marginTop: 8 }]}>Expected outcomes</Text>
                          {renderList(scenario.expectedOutcomes)}
                        </>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ))}
          </View>
        ) : null}

        {model.stakeholders.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stakeholder hypotheses</Text>
            {model.stakeholders.map((stakeholder) => (
              <View key={`${stakeholder.likelyRole}-${stakeholder.hypothesis}`} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {stakeholder.likelyRole}
                  {stakeholder.department ? ` (${stakeholder.department})` : ""}
                </Text>
                <Text style={styles.cardBody}>
                  {stakeholder.hypothesis}
                  {renderCitationLabels(stakeholder.citationLabels)}
                </Text>
                <Text style={styles.cardBody}>Why this role matters: {stakeholder.rationale}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {(model.objectionsAndRebuttals.length > 0 || model.discoveryQuestions.length > 0) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Objections and discovery questions</Text>
            <View style={styles.splitColumns}>
              {model.objectionsAndRebuttals.length > 0 ? (
                <View style={styles.column}>
                  <Text style={styles.label}>Likely objections</Text>
                  {model.objectionsAndRebuttals.map((item) => (
                    <Text key={item.objection} style={styles.listItem}>
                      • {item.objection}
                      {"\n"}  Response: {item.rebuttal}
                      {renderCitationLabels(item.citationLabels)}
                    </Text>
                  ))}
                </View>
              ) : null}
              {model.discoveryQuestions.length > 0 ? (
                <View style={styles.column}>
                  <Text style={styles.label}>Discovery questions</Text>
                  {model.discoveryQuestions.map((item) => (
                    <Text key={item.question} style={styles.listItem}>
                      • {item.question}
                      {"\n"}  Why it matters: {item.whyItMatters}
                      {renderCitationLabels(item.citationLabels)}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evidence and caveats</Text>
          <View style={styles.card}>
            <Text style={styles.cardBody}>
              Evidence coverage: {model.researchCompletenessScore === null ? "Not specified" : `${model.researchCompletenessScore}/100`}
            </Text>
            <Text style={styles.cardBody}>Overall confidence: {formatConfidenceBand(model.overallConfidence)}</Text>
            {model.thinEvidenceWarnings.map((warning) => (
              <Text key={warning.id} style={styles.listItem}>
                • {warning.title}: {warning.message}
                {renderCitationLabels(warning.citationLabels)}
              </Text>
            ))}
            {coverageNotes.length > 0 ? (
              <>
                <Text style={[styles.label, { marginTop: 8 }]}>Areas to validate in discovery</Text>
                {coverageNotes.map((section) => (
                  <Text key={section.key} style={styles.smallListItem}>
                    • {section.label}: {section.completenessLabel}
                  </Text>
                ))}
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report metadata</Text>
          <View style={styles.card}>
            <Text style={styles.cardBody}>Share ID: {model.shareId}</Text>
            <Text style={styles.cardBody}>Company URL: {model.inputUrl}</Text>
            <Text style={styles.cardBody}>Canonical domain: {model.canonicalDomain}</Text>
            <Text style={styles.cardBody}>Run started: {model.runStartedAt}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Source appendix</Text>
          <Text style={styles.sectionSubtitle}>
            Source references are preserved here as the audit trail behind the brief.
          </Text>

          {model.citations.length > 0 ? (
            model.citations.map((citation) => (
              <View key={citation.sourceId} style={styles.appendixItem}>
                <Text style={styles.appendixTitle}>
                  [{citation.label}] {citation.title}
                </Text>
                <Text style={styles.appendixMeta}>
                  {citation.sourceTypeLabel} • {citation.sourceTier}
                </Text>
                <Text style={styles.appendixMeta}>
                  Published {citation.publishedAt ?? "unknown"} • Retrieved {citation.retrievedAt ?? "unknown"}
                </Text>
                <Link src={citation.url} style={styles.link}>
                  {citation.url}
                </Link>
                {citation.summary ? <Text style={styles.cardBody}>{citation.summary}</Text> : null}
              </View>
            ))
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardBody}>No sources were preserved for this export.</Text>
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(model: ReportExportViewModel) {
  return renderToBuffer(<AccountAtlasPdfDocument model={model} />);
}
