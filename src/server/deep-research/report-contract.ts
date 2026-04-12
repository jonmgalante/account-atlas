import "server-only";

import { z } from "zod";

import { useCaseDepartmentValues } from "@/lib/types/account-plan";
import { motionRecommendationValues, reportSectionValues } from "@/lib/types/report";
import { sourceTypeValues } from "@/lib/source";

export const CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_NAME = "account_atlas_canonical_report";
export const CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_VERSION = 1;
export const CANONICAL_ACCOUNT_ATLAS_REPORT_TYPE = "seller_facing_account_plan";

export const canonicalAccountAtlasReportTopLevelFields = [
  "company",
  "report_metadata",
  "executive_summary",
  "fact_base",
  "ai_maturity_signals",
  "recommended_motion",
  "top_opportunities",
  "buying_map",
  "pilot_plan",
  "expansion_scenarios",
  "evidence_coverage",
  "confidence_notes",
  "sources",
  "grounded_fallback",
] as const;

const aiMaturityLevelValues = ["low", "emerging", "moderate", "advanced", "leading"] as const;
const regulatorySensitivityLevelValues = ["low", "medium", "high"] as const;
const researchConfidenceBandValues = ["low", "medium", "high"] as const;
const coverageStrengthValues = ["strong", "usable", "thin"] as const;
const confidenceNoteLevelValues = ["info", "warning"] as const;
const sourceTierValues = ["primary", "secondary", "tertiary", "unknown"] as const;

const confidenceScoreSchema = z.number().int().min(0).max(100);
const compactStringSchema = z.string().trim().min(1).max(180);
const mediumStringSchema = z.string().trim().min(1).max(420);
const longStringSchema = z.string().trim().min(1).max(1_200);
const nullableCompactStringSchema = compactStringSchema.nullable();
const nullableMediumStringSchema = mediumStringSchema.nullable();
const nullableLongStringSchema = longStringSchema.nullable();
const compactStringListSchema = z.array(compactStringSchema).max(10);
const mediumStringListSchema = z.array(mediumStringSchema).max(12);

// Keep citations explicit in the contract so downstream renderers do not need to infer
// whether a statement is source-backed.
export const canonicalReportCitationSchema = z
  .object({
    source_id: z.number().int().positive(),
    support: nullableMediumStringSchema,
  })
  .strict();

export const canonicalConfidenceSignalSchema = z
  .object({
    confidence_band: z.enum(researchConfidenceBandValues),
    confidence_score: confidenceScoreSchema,
    rationale: mediumStringSchema,
  })
  .strict();

export const canonicalCoverageSignalSchema = z
  .object({
    coverage_level: z.enum(coverageStrengthValues),
    coverage_score: confidenceScoreSchema,
    rationale: mediumStringSchema,
  })
  .strict();

export const canonicalFactBaseItemSchema = z
  .object({
    classification: z.enum(["fact", "inference", "hypothesis"]),
    statement: mediumStringSchema,
    why_it_matters: nullableMediumStringSchema,
    confidence: canonicalConfidenceSignalSchema,
    citations: z.array(canonicalReportCitationSchema).min(1).max(8),
  })
  .strict();

export const canonicalLinkedSignalSchema = z
  .object({
    summary: mediumStringSchema,
    citations: z.array(canonicalReportCitationSchema).min(1).max(8),
  })
  .strict();

export const canonicalReportSourceSchema = z
  .object({
    source_id: z.number().int().positive(),
    title: mediumStringSchema,
    url: z.string().trim().url().max(2_048),
    source_type: z.enum(sourceTypeValues),
    source_tier: z.enum(sourceTierValues),
    publisher: nullableCompactStringSchema,
    published_at: z.string().datetime().nullable(),
    retrieved_at: z.string().datetime().nullable(),
    summary: nullableLongStringSchema,
  })
  .strict();

export const canonicalStakeholderHypothesisSchema = z
  .object({
    likely_role: compactStringSchema,
    department: nullableCompactStringSchema,
    hypothesis: mediumStringSchema,
    rationale: mediumStringSchema,
    confidence: canonicalConfidenceSignalSchema,
    citations: z.array(canonicalReportCitationSchema).min(1).max(8),
  })
  .strict();

export const canonicalOpportunityCardSchema = z
  .object({
    priority_rank: z.number().int().min(1).max(10),
    department: z.enum(useCaseDepartmentValues),
    workflow_name: compactStringSchema,
    summary: mediumStringSchema,
    pain_point: mediumStringSchema,
    why_now: mediumStringSchema,
    likely_users: compactStringListSchema,
    expected_outcome: mediumStringSchema,
    success_metrics: compactStringListSchema,
    dependencies: compactStringListSchema,
    security_compliance_notes: compactStringListSchema,
    recommended_motion: z.enum(motionRecommendationValues),
    motion_rationale: mediumStringSchema,
    open_questions: mediumStringListSchema,
    confidence: canonicalConfidenceSignalSchema,
    citations: z.array(canonicalReportCitationSchema).min(1).max(8),
  })
  .strict();

export const canonicalPilotPlanPhaseSchema = z
  .object({
    name: compactStringSchema,
    duration: compactStringSchema,
    goals: compactStringListSchema,
    deliverables: compactStringListSchema,
  })
  .strict();

export const canonicalPilotPlanSchema = z
  .object({
    objective: mediumStringSchema,
    recommended_motion: z.enum(motionRecommendationValues),
    scope: mediumStringSchema,
    success_metrics: compactStringListSchema.min(1),
    phases: z.array(canonicalPilotPlanPhaseSchema).min(1).max(5),
    dependencies: compactStringListSchema,
    risks: compactStringListSchema,
    citations: z.array(canonicalReportCitationSchema).min(1).max(8),
  })
  .strict();

export const canonicalExpansionScenarioSchema = z
  .object({
    summary: mediumStringSchema,
    assumptions: compactStringListSchema.min(1),
    expected_outcomes: compactStringListSchema.min(1),
    citations: z.array(canonicalReportCitationSchema).min(1).max(8),
  })
  .strict();

export const canonicalConfidenceNoteSchema = z
  .object({
    level: z.enum(confidenceNoteLevelValues),
    related_sections: z.array(z.enum(reportSectionValues)).max(6),
    note: mediumStringSchema,
    citations: z.array(canonicalReportCitationSchema).max(8),
  })
  .strict();

export const canonicalSectionCoverageSchema = z
  .object({
    section: z.enum(reportSectionValues),
    coverage: canonicalCoverageSignalSchema,
    confidence: canonicalConfidenceSignalSchema,
    citations: z.array(canonicalReportCitationSchema).max(8),
  })
  .strict();

export const canonicalAccountAtlasReportSchema = z
  .object({
    company: z
      .object({
        resolved_name: compactStringSchema,
        canonical_domain: compactStringSchema,
        relationship_to_url: nullableMediumStringSchema,
        archetype: compactStringSchema,
        company_brief: mediumStringSchema,
        business_model: nullableCompactStringSchema,
        customer_type: nullableCompactStringSchema,
        industry: nullableCompactStringSchema,
        sector: nullableCompactStringSchema,
        offerings: nullableMediumStringSchema,
        headquarters: nullableCompactStringSchema,
        public_company: z.boolean().nullable(),
        citations: z.array(canonicalReportCitationSchema).min(1).max(8),
      })
      .strict(),
    report_metadata: z
      .object({
        schema_name: z.literal(CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_NAME),
        schema_version: z.literal(CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_VERSION),
        report_type: z.literal(CANONICAL_ACCOUNT_ATLAS_REPORT_TYPE),
        generated_at: z.string().datetime(),
        company_url: z.string().trim().url().max(2_048),
        normalized_company_url: z.string().trim().url().max(2_048),
        canonical_domain: compactStringSchema,
        report_mode: z.enum(["full_report", "grounded_fallback"]),
      })
      .strict(),
    executive_summary: z
      .object({
        summary: longStringSchema,
        why_now: mediumStringSchema,
        strategic_takeaway: mediumStringSchema,
        citations: z.array(canonicalReportCitationSchema).min(1).max(8),
      })
      .strict(),
    fact_base: z.array(canonicalFactBaseItemSchema).max(20),
    ai_maturity_signals: z
      .object({
        maturity_level: z.enum(aiMaturityLevelValues),
        maturity_summary: mediumStringSchema,
        notable_signals: z.array(canonicalLinkedSignalSchema).max(8),
        regulatory_sensitivity: z
          .object({
            level: z.enum(regulatorySensitivityLevelValues),
            rationale: mediumStringSchema,
            citations: z.array(canonicalReportCitationSchema).min(1).max(8),
          })
          .strict(),
        citations: z.array(canonicalReportCitationSchema).min(1).max(8),
      })
      .strict(),
    recommended_motion: z
      .object({
        recommended_motion: z.enum(motionRecommendationValues),
        rationale: mediumStringSchema,
        deployment_shape: nullableMediumStringSchema,
        citations: z.array(canonicalReportCitationSchema).min(1).max(8),
      })
      .strict(),
    top_opportunities: z.array(canonicalOpportunityCardSchema).max(5),
    buying_map: z
      .object({
        stakeholder_hypotheses: z.array(canonicalStakeholderHypothesisSchema).max(8),
        likely_objections: z.array(
          z
            .object({
              objection: mediumStringSchema,
              rebuttal: mediumStringSchema,
              citations: z.array(canonicalReportCitationSchema).min(1).max(8),
            })
            .strict(),
        ).max(8),
        discovery_questions: z.array(
          z
            .object({
              question: mediumStringSchema,
              why_it_matters: mediumStringSchema,
              citations: z.array(canonicalReportCitationSchema).min(1).max(8),
            })
            .strict(),
        ).max(12),
      })
      .strict(),
    pilot_plan: canonicalPilotPlanSchema.nullable(),
    expansion_scenarios: z
      .object({
        low: canonicalExpansionScenarioSchema.nullable(),
        base: canonicalExpansionScenarioSchema.nullable(),
        high: canonicalExpansionScenarioSchema.nullable(),
      })
      .strict(),
    evidence_coverage: z
      .object({
        overall_confidence: canonicalConfidenceSignalSchema,
        overall_coverage: canonicalCoverageSignalSchema,
        research_completeness_score: confidenceScoreSchema,
        thin_evidence: z.boolean(),
        evidence_gaps: mediumStringListSchema,
        section_coverage: z.array(canonicalSectionCoverageSchema).length(reportSectionValues.length),
      })
      .strict(),
    confidence_notes: z.array(canonicalConfidenceNoteSchema).max(12),
    sources: z.array(canonicalReportSourceSchema).min(1).max(24),
    grounded_fallback: z
      .object({
        reason: mediumStringSchema,
        summary: mediumStringSchema,
        opportunity_hypothesis_note: nullableMediumStringSchema,
        citations: z.array(canonicalReportCitationSchema).min(1).max(8),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type CanonicalReportCitation = z.infer<typeof canonicalReportCitationSchema>;
export type CanonicalConfidenceSignal = z.infer<typeof canonicalConfidenceSignalSchema>;
export type CanonicalCoverageSignal = z.infer<typeof canonicalCoverageSignalSchema>;
export type CanonicalFactBaseItem = z.infer<typeof canonicalFactBaseItemSchema>;
export type CanonicalReportSource = z.infer<typeof canonicalReportSourceSchema>;
export type CanonicalStakeholderHypothesis = z.infer<typeof canonicalStakeholderHypothesisSchema>;
export type CanonicalOpportunityCard = z.infer<typeof canonicalOpportunityCardSchema>;
export type CanonicalPilotPlan = z.infer<typeof canonicalPilotPlanSchema>;
export type CanonicalExpansionScenario = z.infer<typeof canonicalExpansionScenarioSchema>;
export type CanonicalConfidenceNote = z.infer<typeof canonicalConfidenceNoteSchema>;
export type CanonicalSectionCoverage = z.infer<typeof canonicalSectionCoverageSchema>;
export type CanonicalAccountAtlasReport = z.infer<typeof canonicalAccountAtlasReportSchema>;

export const canonicalAccountAtlasReportJsonSchema = z.toJSONSchema(canonicalAccountAtlasReportSchema);
