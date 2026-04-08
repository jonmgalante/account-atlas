import "server-only";

import { z } from "zod";

const reportSectionSchema = z.enum([
  "company-brief",
  "fact-base",
  "ai-maturity-signals",
  "prioritized-use-cases",
  "recommended-motion",
  "stakeholder-hypotheses",
  "objections",
  "discovery-questions",
  "pilot-plan",
  "expansion-scenarios",
]);

const confidenceScoreSchema = z.number().int().min(0).max(100);
const sourceIdListSchema = z.array(z.number().int().positive()).min(1);
const sourceUrlListSchema = z.array(z.string().url()).min(1);

const researchLinkedItemSchema = z.object({
  summary: z.string().min(1).max(500),
  sourceIds: sourceIdListSchema,
});

const externalResearchLinkedItemSchema = z.object({
  summary: z.string().min(1).max(500),
  sourceUrls: sourceUrlListSchema,
});

export const entityResolutionSchema = z.object({
  companyName: z.string().min(1).max(200),
  canonicalDomain: z.string().min(1).max(255),
  archetype: z.string().min(1).max(120),
  businessModel: z.string().min(1).max(160).nullable(),
  industry: z.string().min(1).max(160).nullable(),
  publicCompany: z.boolean().nullable(),
  headquarters: z.string().min(1).max(160).nullable(),
  confidence: confidenceScoreSchema,
  sourceIds: sourceIdListSchema,
});

export const externalSourceEnrichmentSchema = z.object({
  entityResolution: entityResolutionSchema,
  discoveredSources: z.array(
    z.object({
      url: z.string().url(),
      title: z.string().min(1).max(300),
      sourceType: z.enum([
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
        "other",
      ]),
      sourceTier: z.enum(["primary", "secondary", "tertiary", "unknown"]),
      publishedAt: z.string().datetime().nullable(),
      summary: z.string().min(1).max(700),
      whyItMatters: z.string().min(1).max(400),
    }),
  ),
  growthPriorities: z.array(externalResearchLinkedItemSchema),
  aiMaturitySignals: z.array(externalResearchLinkedItemSchema),
  regulatorySignals: z.array(externalResearchLinkedItemSchema),
  notableProductSignals: z.array(externalResearchLinkedItemSchema),
  notableHiringSignals: z.array(externalResearchLinkedItemSchema),
  notableTrustSignals: z.array(externalResearchLinkedItemSchema),
  complaintThemes: z.array(externalResearchLinkedItemSchema),
  leadershipSocialThemes: z.array(externalResearchLinkedItemSchema),
  researchCompletenessScore: confidenceScoreSchema,
  evidenceGaps: z.array(z.string().min(1).max(300)),
});

export const factNormalizationSchema = z.object({
  facts: z.array(
    z.object({
      claim: z.string().min(1).max(600),
      rationale: z.string().min(1).max(500).nullable(),
      section: reportSectionSchema,
      classification: z.enum(["fact", "inference", "hypothesis"]),
      confidence: confidenceScoreSchema,
      freshness: z.enum(["current", "recent", "stale", "unknown"]),
      sentiment: z.enum(["positive", "neutral", "negative", "mixed", "unknown"]),
      relevance: confidenceScoreSchema,
      evidenceSnippet: z.string().min(1).max(400).nullable(),
      sourceIds: sourceIdListSchema,
    }),
  ),
});

export const researchSummarySchema = z.object({
  companyIdentity: z.object({
    companyName: z.string().min(1).max(200),
    archetype: z.string().min(1).max(120),
    businessModel: z.string().min(1).max(160).nullable(),
    industry: z.string().min(1).max(160).nullable(),
    publicCompany: z.boolean().nullable(),
    headquarters: z.string().min(1).max(160).nullable(),
    sourceIds: sourceIdListSchema,
  }),
  growthPriorities: z.array(researchLinkedItemSchema),
  aiMaturityEstimate: z.object({
    level: z.enum(["low", "emerging", "moderate", "advanced", "leading"]),
    rationale: z.string().min(1).max(500),
    sourceIds: sourceIdListSchema,
  }),
  regulatorySensitivity: z.object({
    level: z.enum(["low", "medium", "high"]),
    rationale: z.string().min(1).max(500),
    sourceIds: sourceIdListSchema,
  }),
  notableProductSignals: z.array(researchLinkedItemSchema),
  notableHiringSignals: z.array(researchLinkedItemSchema),
  notableTrustSignals: z.array(researchLinkedItemSchema),
  complaintThemes: z.array(researchLinkedItemSchema),
  leadershipSocialThemes: z.array(researchLinkedItemSchema),
  researchCompletenessScore: confidenceScoreSchema,
  confidenceBySection: z.array(
    z.object({
      section: reportSectionSchema,
      confidence: confidenceScoreSchema,
      rationale: z.string().min(1).max(300),
    }),
  ),
  evidenceGaps: z.array(z.string().min(1).max(300)),
  overallConfidence: z.enum(["low", "medium", "high"]),
  sourceIds: sourceIdListSchema,
});

export type EntityResolutionOutput = z.infer<typeof entityResolutionSchema>;
export type ExternalSourceEnrichmentOutput = z.infer<typeof externalSourceEnrichmentSchema>;
export type FactNormalizationOutput = z.infer<typeof factNormalizationSchema>;
export type ResearchSummaryOutput = z.infer<typeof researchSummarySchema>;

export const entityResolutionJsonSchema = z.toJSONSchema(entityResolutionSchema);
export const externalSourceEnrichmentJsonSchema = z.toJSONSchema(externalSourceEnrichmentSchema);
export const factNormalizationJsonSchema = z.toJSONSchema(factNormalizationSchema);
export const researchSummaryJsonSchema = z.toJSONSchema(researchSummarySchema);
