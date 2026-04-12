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
const sourceUrlSchema = z.string().min(1).max(2_048);
const sourceUrlListSchema = z.array(sourceUrlSchema).min(1);

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
  relationshipToCanonicalDomain: z.string().min(1).max(240).nullable(),
  archetype: z.string().min(1).max(120),
  businessModel: z.string().min(1).max(160).nullable(),
  customerType: z.string().min(1).max(160).nullable(),
  offerings: z.string().min(1).max(240).nullable(),
  sector: z.string().min(1).max(160).nullable(),
  industry: z.string().min(1).max(160).nullable(),
  publicCompany: z.boolean().nullable(),
  headquarters: z.string().min(1).max(160).nullable(),
  confidence: confidenceScoreSchema,
  sourceIds: sourceIdListSchema,
});

const externalEntityResolutionSchema = z.object({
  companyName: z.string().min(1).max(200),
  canonicalDomain: z.string().min(1).max(255),
  relationshipToCanonicalDomain: z.string().min(1).max(240).nullable(),
  archetype: z.string().min(1).max(120),
  businessModel: z.string().min(1).max(160).nullable(),
  customerType: z.string().min(1).max(160).nullable(),
  offerings: z.string().min(1).max(240).nullable(),
  sector: z.string().min(1).max(160).nullable(),
  industry: z.string().min(1).max(160).nullable(),
  publicCompany: z.boolean().nullable(),
  headquarters: z.string().min(1).max(160).nullable(),
  confidence: confidenceScoreSchema,
  sourceUrls: sourceUrlListSchema,
});

const discoveredSourceSchema = z.object({
  url: sourceUrlSchema,
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

export const entityResolutionSearchSchema = z.object({
  entityResolution: externalEntityResolutionSchema,
  discoveredSources: z.array(discoveredSourceSchema),
  retryRationale: z.string().min(1).max(300),
});

export const externalSourceEnrichmentSchema = z.object({
  entityResolution: externalEntityResolutionSchema,
  discoveredSources: z.array(discoveredSourceSchema),
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
    canonicalDomain: z.string().min(1).max(255).optional(),
    relationshipToCanonicalDomain: z.string().min(1).max(240).nullable().optional(),
    archetype: z.string().min(1).max(120),
    businessModel: z.string().min(1).max(160).nullable(),
    customerType: z.string().min(1).max(160).nullable().optional(),
    offerings: z.string().min(1).max(240).nullable().optional(),
    sector: z.string().min(1).max(160).nullable().optional(),
    industry: z.string().min(1).max(160).nullable(),
    publicCompany: z.boolean().nullable(),
    headquarters: z.string().min(1).max(160).nullable(),
    confidence: confidenceScoreSchema.optional(),
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
export type EntityResolutionSearchOutput = z.infer<typeof entityResolutionSearchSchema>;
export type ExternalSourceEnrichmentOutput = z.infer<typeof externalSourceEnrichmentSchema>;
export type FactNormalizationOutput = z.infer<typeof factNormalizationSchema>;
export type ResearchSummaryOutput = z.infer<typeof researchSummarySchema>;

export const entityResolutionJsonSchema = z.toJSONSchema(entityResolutionSchema);
export const entityResolutionSearchJsonSchema = z.toJSONSchema(entityResolutionSearchSchema);
export const externalSourceEnrichmentJsonSchema = z.toJSONSchema(externalSourceEnrichmentSchema);
export const factNormalizationJsonSchema = z.toJSONSchema(factNormalizationSchema);
export const researchSummaryJsonSchema = z.toJSONSchema(researchSummarySchema);
