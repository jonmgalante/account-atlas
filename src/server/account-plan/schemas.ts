import "server-only";

import { z } from "zod";

import { useCaseDepartmentValues } from "@/lib/types/account-plan";

const confidenceScoreSchema = z.number().int().min(0).max(100);
const sourceIdListSchema = z.array(z.number().int().positive()).min(1);
const shortListItemSchema = z.string().min(1).max(180);
const mediumListItemSchema = z.string().min(1).max(260);
const longTextSchema = z.string().min(1).max(600);
const motionRecommendationSchema = z.enum(["workspace", "api_platform", "hybrid"]);
const discoveredSourceSchema = z.object({
  url: z.string().min(1).max(2_048),
  title: z.string().min(1).max(300),
  sourceType: z.enum([
    "company_homepage",
    "about_page",
    "product_page",
    "solutions_page",
    "security_page",
    "privacy_page",
    "careers_page",
    "newsroom_page",
    "investor_relations_page",
    "news_article",
    "investor_report",
    "earnings_release",
    "company_social_profile",
    "executive_social_profile",
    "review_platform",
    "complaint_forum",
    "support_page",
    "status_page",
    "incident_page",
    "competitor_page",
    "market_analysis",
    "company_site",
    "other",
  ]),
  sourceTier: z.enum(["primary", "secondary", "tertiary", "unknown"]),
  publishedAt: z.string().datetime().nullable(),
  summary: z.string().min(1).max(700),
  whyItMatters: z.string().min(1).max(400),
});
const qualityGateSectionSchema = z.enum(["executive_summary", "motion_recommendation", "top_opportunities"]);
const qualityGateIssueCodeSchema = z.enum([
  "identity_mismatch",
  "industry_or_business_model_mismatch",
  "unsupported_citations",
  "seller_workflow_self_reference",
  "transient_operational_anomaly",
  "maintenance_page_overfit",
  "generic_language",
]);
const pilotPlanSchema = z.object({
  objective: z.string().min(1).max(420),
  recommendedMotion: motionRecommendationSchema,
  scope: z.string().min(1).max(420),
  successMetrics: z.array(shortListItemSchema).min(2).max(8),
  phases: z.array(
    z.object({
      name: z.string().min(1).max(140),
      duration: z.string().min(1).max(120),
      goals: z.array(shortListItemSchema).min(1).max(6),
      deliverables: z.array(shortListItemSchema).min(1).max(6),
    }),
  ).min(3).max(5),
  dependencies: z.array(shortListItemSchema).min(1).max(8),
  risks: z.array(shortListItemSchema).min(1).max(8),
  evidenceSourceIds: sourceIdListSchema,
});
const expansionScenarioSchema = z.object({
  summary: longTextSchema,
  assumptions: z.array(shortListItemSchema).min(1).max(6),
  expectedOutcomes: z.array(shortListItemSchema).min(1).max(6),
  evidenceSourceIds: sourceIdListSchema,
});

export const useCaseScorecardSchema = z.object({
  businessValue: confidenceScoreSchema,
  deploymentReadiness: confidenceScoreSchema,
  expansionPotential: confidenceScoreSchema,
  openaiFit: confidenceScoreSchema,
  sponsorLikelihood: confidenceScoreSchema,
  evidenceConfidence: confidenceScoreSchema,
  riskPenalty: confidenceScoreSchema,
});

export const candidateUseCaseGenerationSchema = z.object({
  useCases: z.array(
    z.object({
      department: z.enum(useCaseDepartmentValues),
      workflowName: z.string().min(1).max(160),
      summary: z.string().min(1).max(420),
      painPoint: z.string().min(1).max(420),
      whyNow: z.string().min(1).max(420),
      likelyUsers: z.array(shortListItemSchema).min(1).max(8),
      expectedOutcome: z.string().min(1).max(420),
      metrics: z.array(shortListItemSchema).min(1).max(6),
      dependencies: z.array(shortListItemSchema).max(8),
      securityComplianceNotes: z.array(shortListItemSchema).max(6),
      recommendedMotion: motionRecommendationSchema,
      motionRationale: z.string().min(1).max(320),
      evidenceSourceIds: sourceIdListSchema,
      openQuestions: z.array(mediumListItemSchema).min(1).max(8),
      scorecard: useCaseScorecardSchema,
    }),
  ).min(3).max(15),
});

export const accountPlanNarrativeSchema = z.object({
  overallAccountMotion: z.object({
    recommendedMotion: motionRecommendationSchema,
    rationale: z.string().min(1).max(500),
    evidenceSourceIds: sourceIdListSchema,
  }),
  stakeholderHypotheses: z.array(
    z.object({
      likelyRole: z.string().min(1).max(140),
      department: z.string().min(1).max(140).nullable(),
      hypothesis: z.string().min(1).max(320),
      rationale: z.string().min(1).max(420),
      confidence: confidenceScoreSchema,
      evidenceSourceIds: sourceIdListSchema,
    }),
  ).min(3).max(8),
  objectionsAndRebuttals: z.array(
    z.object({
      objection: z.string().min(1).max(260),
      rebuttal: z.string().min(1).max(420),
      evidenceSourceIds: sourceIdListSchema,
    }),
  ).max(8),
  discoveryQuestions: z.array(
    z.object({
      question: z.string().min(1).max(240),
      whyItMatters: z.string().min(1).max(320),
      evidenceSourceIds: sourceIdListSchema,
    }),
  ).max(12),
  pilotPlan: pilotPlanSchema.nullable(),
  expansionScenarios: z.object({
    low: expansionScenarioSchema.nullable(),
    base: expansionScenarioSchema.nullable(),
    high: expansionScenarioSchema.nullable(),
  }),
});

export const accountPlanQualityGateSchema = z.object({
  overallPass: z.boolean(),
  sections: z.array(
    z.object({
      section: qualityGateSectionSchema,
      status: z.enum(["pass", "fail"]),
      confidence: confidenceScoreSchema,
      summary: z.string().min(1).max(320),
      issueCodes: z.array(qualityGateIssueCodeSchema).max(6),
      supportingSourceIds: z.array(z.number().int().positive()).max(12),
      requiresTargetedSources: z.boolean(),
      targetedSourceFocus: z.array(z.string().min(1).max(160)).max(5),
    }),
  ).min(3).max(3),
  retryPlan: z.object({
    regenerateCandidateUseCases: z.boolean(),
    regenerateNarrative: z.boolean(),
    fetchTargetedSources: z.boolean(),
    rationale: z.string().min(1).max(420),
  }),
});

export const accountPlanTargetedSourceSearchSchema = z.object({
  discoveredSources: z.array(discoveredSourceSchema).max(8),
  retrievalSummary: z.string().min(1).max(320),
});

export type CandidateUseCaseGenerationOutput = z.infer<typeof candidateUseCaseGenerationSchema>;
export type AccountPlanNarrativeOutput = z.infer<typeof accountPlanNarrativeSchema>;
export type AccountPlanQualityGateOutput = z.infer<typeof accountPlanQualityGateSchema>;
export type AccountPlanTargetedSourceSearchOutput = z.infer<typeof accountPlanTargetedSourceSearchSchema>;

export const candidateUseCaseGenerationJsonSchema = z.toJSONSchema(candidateUseCaseGenerationSchema);
export const accountPlanNarrativeJsonSchema = z.toJSONSchema(accountPlanNarrativeSchema);
export const accountPlanQualityGateJsonSchema = z.toJSONSchema(accountPlanQualityGateSchema);
export const accountPlanTargetedSourceSearchJsonSchema = z.toJSONSchema(accountPlanTargetedSourceSearchSchema);
