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
  shareId: {
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
  warningCard: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f2c94c",
    backgroundColor: "#fff8db",
    borderRadius: 12,
  },
  warningTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "#7c5e10",
  },
  warningBody: {
    marginTop: 4,
    color: "#6b5b20",
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
  muted: {
    color: "#64748b",
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

function AccountAtlasPdfDocument({ model }: { model: ReportExportViewModel }) {
  return (
    <Document
      title={model.reportTitle}
      author="Account Atlas"
      subject="Evidence-backed enterprise account plan"
      keywords="account atlas, account plan, ai use cases"
    >
      <Page size="LETTER" style={styles.page}>
        <View fixed style={styles.fixedHeader}>
          <Text style={styles.brand}>Account Atlas</Text>
          <Text style={styles.shareId}>Share ID {model.shareId}</Text>
        </View>

        <Text style={styles.coverTitle}>{model.reportTitle}</Text>
        <Text style={styles.coverSubtitle}>
          Evidence-backed public account plan built from first-party crawl sources and external public research. Recommendations remain explicitly tied to persisted source IDs.
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.chip}>Domain: {model.canonicalDomain}</Text>
          <Text style={styles.chip}>Motion: {model.overallMotion.label}</Text>
          <Text style={styles.chip}>
            Completeness: {model.researchCompletenessScore === null ? "Pending" : `${model.researchCompletenessScore}/100`}
          </Text>
          <Text style={styles.chip}>Confidence: {model.overallConfidence ?? "Pending"}</Text>
        </View>

        {model.thinEvidenceWarnings.slice(0, 2).map((warning) => (
          <View key={warning.id} style={styles.warningCard}>
            <Text style={styles.warningTitle}>{warning.title}</Text>
            <Text style={styles.warningBody}>
              {warning.message}
              {renderCitationLabels(warning.citationLabels)}
            </Text>
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account snapshot</Text>
          <View style={styles.grid}>
            <View style={[styles.card, { width: "48%" }]}>
              <Text style={styles.cardTitle}>Company identity</Text>
              <Text style={styles.cardBody}>
                {model.companyName}
                {model.companyIdentity.archetype ? ` • ${model.companyIdentity.archetype}` : ""}
                {renderCitationLabels(model.companyIdentity.citationLabels)}
              </Text>
              <Text style={styles.cardBody}>Business model: {model.companyIdentity.businessModel ?? "Pending"}</Text>
              <Text style={styles.cardBody}>Industry: {model.companyIdentity.industry ?? "Pending"}</Text>
              <Text style={styles.cardBody}>Headquarters: {model.companyIdentity.headquarters ?? "Pending"}</Text>
            </View>
            <View style={[styles.card, { width: "48%" }]}>
              <Text style={styles.cardTitle}>Research posture</Text>
              <Text style={styles.statValue}>
                {model.researchCompletenessScore === null ? "Pending" : `${model.researchCompletenessScore}/100`}
              </Text>
              <Text style={styles.cardBody}>Overall confidence: {model.overallConfidence ?? "Pending"}</Text>
              <Text style={styles.cardBody}>
                AI maturity: {model.aiMaturityEstimate.level ?? "Pending"}
                {model.aiMaturityEstimate.rationale ? ` • ${model.aiMaturityEstimate.rationale}` : ""}
                {renderCitationLabels(model.aiMaturityEstimate.citationLabels)}
              </Text>
              <Text style={styles.cardBody}>
                Regulatory sensitivity: {model.regulatorySensitivity.level ?? "Pending"}
                {model.regulatorySensitivity.rationale ? ` • ${model.regulatorySensitivity.rationale}` : ""}
                {renderCitationLabels(model.regulatorySensitivity.citationLabels)}
              </Text>
            </View>
          </View>

          <View style={styles.grid}>
            <View style={[styles.card, { width: "48%" }]}>
              <Text style={styles.cardTitle}>Growth priorities</Text>
              {model.growthPriorities.length > 0 ? (
                model.growthPriorities.slice(0, 3).map((item) => (
                  <Text key={item.summary} style={styles.listItem}>
                    • {item.summary}
                    {renderCitationLabels(item.citationLabels)}
                  </Text>
                ))
              ) : (
                <Text style={styles.listItem}>No confident growth priorities were established.</Text>
              )}
            </View>
            <View style={[styles.card, { width: "48%" }]}>
              <Text style={styles.cardTitle}>Section confidence</Text>
              {model.sectionAssessments.slice(0, 5).map((section) => (
                <Text key={section.key} style={styles.listItem}>
                  • {section.label}: {section.confidence === null ? "Pending" : `${section.confidence}/100`} ({section.completenessLabel})
                </Text>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {model.publishMode === "grounded_fallback" ? "Grounded brief" : "Recommended motion"}
          </Text>
          <Text style={styles.paragraph}>
            {model.publishMode === "grounded_fallback"
              ? `${model.groundedFallbackBrief.summary ?? "No grounded fallback summary was persisted."}${renderCitationLabels(model.groundedFallbackBrief.citationLabels)}`
              : `${model.overallMotion.label}: ${model.overallMotion.rationale}${renderCitationLabels(model.overallMotion.citationLabels)}`}
          </Text>
          {model.publishMode === "grounded_fallback" && model.groundedFallbackBrief.opportunityHypothesisNote ? (
            <Text style={styles.paragraph}>{model.groundedFallbackBrief.opportunityHypothesisNote}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {model.publishMode === "grounded_fallback" ? "Grounded opportunity hypotheses" : "Top 3 use cases"}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {model.publishMode === "grounded_fallback"
              ? "Lower-confidence hypotheses are shown only when they still meet the minimum grounding bar."
              : "Practical, measurable opportunities ranked by the locked scoring model."}
          </Text>

          {model.topUseCases.length > 0 ? (
            model.topUseCases.map((useCase) => (
              <View key={`${useCase.priorityRank}-${useCase.workflowName}`} style={styles.useCaseCard}>
                <View style={styles.useCaseHeader}>
                  <Text style={styles.useCaseTitle}>
                    {useCase.priorityRank}. {useCase.workflowName}
                  </Text>
                  <Text style={styles.badge}>{useCase.recommendedMotionLabel}</Text>
                </View>
                <Text style={styles.paragraph}>
                  {useCase.departmentLabel} • Priority score {useCase.priorityScore.toFixed(1)}
                </Text>
                <Text style={styles.paragraph}>{useCase.summary}</Text>
                <Text style={styles.paragraph}>Pain point: {useCase.painPoint}</Text>
                <Text style={styles.paragraph}>
                  Why now: {useCase.whyNow}
                  {renderCitationLabels(useCase.citationLabels)}
                </Text>
                <Text style={styles.paragraph}>Expected outcome: {useCase.expectedOutcome}</Text>
                <View style={styles.splitColumns}>
                  <View style={styles.column}>
                    <Text style={styles.label}>Dependencies</Text>
                    {renderList(useCase.dependencies)}
                  </View>
                  <View style={styles.column}>
                    <Text style={styles.label}>Open questions</Text>
                    {renderList(useCase.openQuestions)}
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardBody}>
                {model.publishMode === "grounded_fallback"
                  ? "No grounded opportunity hypotheses met the minimum evidence bar for this run."
                  : "No prioritized use cases were persisted for this run."}
              </Text>
            </View>
          )}
        </View>

        <View wrap={false} style={styles.section}>
          <Text style={styles.sectionTitle}>90-day pilot plan</Text>
          {model.pilotPlan ? (
            <View style={styles.card}>
              <Text style={styles.cardBody}>
                Objective: {model.pilotPlan.objective}
                {renderCitationLabels(model.pilotPlan.citationLabels)}
              </Text>
              <Text style={styles.cardBody}>Recommended motion: {model.pilotPlan.recommendedMotionLabel}</Text>
              <Text style={styles.cardBody}>Scope: {model.pilotPlan.scope}</Text>
              <Text style={[styles.label, { marginTop: 8 }]}>Success metrics</Text>
              {renderList(model.pilotPlan.successMetrics)}
              <Text style={[styles.label, { marginTop: 8 }]}>Phases</Text>
              {model.pilotPlan.phases.map((phase) => (
                <Text key={`${phase.name}-${phase.duration}`} style={styles.listItem}>
                  • {phase.name} ({phase.duration}): goals {phase.goals.join("; ") || "Pending"}; deliverables {phase.deliverables.join("; ") || "Pending"}
                </Text>
              ))}
              <Text style={[styles.label, { marginTop: 8 }]}>Dependencies</Text>
              {renderList(model.pilotPlan.dependencies)}
              <Text style={[styles.label, { marginTop: 8 }]}>Risks</Text>
              {renderList(model.pilotPlan.risks)}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardBody}>No pilot plan was persisted for this run.</Text>
            </View>
          )}
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View fixed style={styles.fixedHeader}>
          <Text style={styles.brand}>Account Atlas</Text>
          <Text style={styles.shareId}>{model.reportTitle}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expansion scenarios</Text>
          {([
            ["Low", model.expansionScenarios.low],
            ["Base", model.expansionScenarios.base],
            ["High", model.expansionScenarios.high],
          ] as const).map(([label, scenario]) => (
            <View key={label} style={styles.card}>
              <Text style={styles.cardTitle}>{label}</Text>
              <Text style={styles.cardBody}>
                {scenario?.summary ?? "No scenario was persisted for this case."}
                {scenario ? renderCitationLabels(scenario.citationLabels) : ""}
              </Text>
              {scenario ? (
                <>
                  <Text style={[styles.label, { marginTop: 8 }]}>Assumptions</Text>
                  {renderList(scenario.assumptions)}
                  <Text style={[styles.label, { marginTop: 8 }]}>Expected outcomes</Text>
                  {renderList(scenario.expectedOutcomes)}
                </>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Objections and discovery questions</Text>
          <View style={styles.splitColumns}>
            <View style={styles.column}>
              <Text style={styles.label}>Common objections</Text>
              {model.objectionsAndRebuttals.length > 0 ? (
                model.objectionsAndRebuttals.map((item) => (
                  <Text key={item.objection} style={styles.listItem}>
                    • {item.objection}
                    {"\n"}  Rebuttal: {item.rebuttal}
                    {renderCitationLabels(item.citationLabels)}
                  </Text>
                ))
              ) : (
                <Text style={styles.listItem}>No objections were persisted for this run.</Text>
              )}
            </View>
            <View style={styles.column}>
              <Text style={styles.label}>Discovery questions</Text>
              {model.discoveryQuestions.length > 0 ? (
                model.discoveryQuestions.map((item) => (
                  <Text key={item.question} style={styles.listItem}>
                    • {item.question}
                    {"\n"}  Why it matters: {item.whyItMatters}
                    {renderCitationLabels(item.citationLabels)}
                  </Text>
                ))
              ) : (
                <Text style={styles.listItem}>No discovery questions were persisted for this run.</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Citations appendix</Text>
          <Text style={styles.sectionSubtitle}>
            Source references are kept in the same normalized registry used by downstream synthesis.
          </Text>

          {model.citations.length > 0 ? (
            model.citations.map((citation) => (
              <View key={citation.sourceId} style={styles.appendixItem}>
                <Text style={styles.appendixTitle}>
                  [{citation.label}] {citation.title}
                </Text>
                <Text style={styles.appendixMeta}>
                  {citation.sourceTypeLabel} • {citation.sourceTier} • {citation.mimeType ?? "unknown mime"}
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
              <Text style={styles.cardBody}>No sources were persisted for this run.</Text>
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
