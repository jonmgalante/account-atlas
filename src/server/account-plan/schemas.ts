import "server-only";

import { z } from "zod";

import { useCaseDepartmentValues } from "@/lib/types/account-plan";

const confidenceScoreSchema = z.number().int().min(0).max(100);
const sourceIdListSchema = z.array(z.number().int().positive()).min(1);
const shortListItemSchema = z.string().min(1).max(180);
const mediumListItemSchema = z.string().min(1).max(260);
const longTextSchema = z.string().min(1).max(600);
const motionRecommendationSchema = z.enum(["workspace", "api_platform", "hybrid"]);

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
  ).min(12).max(15),
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
  ).min(4).max(8),
  discoveryQuestions: z.array(
    z.object({
      question: z.string().min(1).max(240),
      whyItMatters: z.string().min(1).max(320),
      evidenceSourceIds: sourceIdListSchema,
    }),
  ).min(6).max(12),
  pilotPlan: z.object({
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
  }),
  expansionScenarios: z.object({
    low: z.object({
      summary: longTextSchema,
      assumptions: z.array(shortListItemSchema).min(1).max(6),
      expectedOutcomes: z.array(shortListItemSchema).min(1).max(6),
      evidenceSourceIds: sourceIdListSchema,
    }),
    base: z.object({
      summary: longTextSchema,
      assumptions: z.array(shortListItemSchema).min(1).max(6),
      expectedOutcomes: z.array(shortListItemSchema).min(1).max(6),
      evidenceSourceIds: sourceIdListSchema,
    }),
    high: z.object({
      summary: longTextSchema,
      assumptions: z.array(shortListItemSchema).min(1).max(6),
      expectedOutcomes: z.array(shortListItemSchema).min(1).max(6),
      evidenceSourceIds: sourceIdListSchema,
    }),
  }),
});

export type CandidateUseCaseGenerationOutput = z.infer<typeof candidateUseCaseGenerationSchema>;
export type AccountPlanNarrativeOutput = z.infer<typeof accountPlanNarrativeSchema>;

export const candidateUseCaseGenerationJsonSchema = z.toJSONSchema(candidateUseCaseGenerationSchema);
export const accountPlanNarrativeJsonSchema = z.toJSONSchema(accountPlanNarrativeSchema);
