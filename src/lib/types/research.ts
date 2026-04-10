import type { ReportSectionKey } from "@/lib/types/report";
import type { SourceType } from "@/lib/source";

export type ResearchConfidenceBand = "low" | "medium" | "high";
export type AiMaturityLevel = "low" | "emerging" | "moderate" | "advanced" | "leading";
export type RegulatorySensitivityLevel = "low" | "medium" | "high";

export type SourceRegistryEntry = {
  sourceId: number;
  title: string;
  url: string;
  sourceType: SourceType;
  sourceTier: "primary" | "secondary" | "tertiary" | "unknown";
  publishedAt: string | null;
  retrievedAt: string | null;
  summary: string | null;
  availableInFileSearch: boolean;
};

export type ResearchLinkedItem = {
  summary: string;
  sourceIds: number[];
};

export type ResearchConfidenceBySection = {
  section: ReportSectionKey;
  confidence: number;
  rationale: string;
};

export type CompanyIdentitySummary = {
  companyName: string;
  archetype: string;
  businessModel: string | null;
  industry: string | null;
  publicCompany: boolean | null;
  headquarters: string | null;
  sourceIds: number[];
};

export type FactPacketEvidence = {
  factId: number;
  section: ReportSectionKey;
  classification: "fact" | "inference" | "hypothesis";
  claim: string;
  rationale: string | null;
  confidence: number;
  freshness: "current" | "recent" | "stale" | "unknown";
  sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown";
  relevance: number;
  evidenceSnippet: string | null;
  sourceIds: number[];
};

export type FactPacketSectionCoverage = {
  section: ReportSectionKey;
  status: "covered" | "limited" | "missing";
  confidence: number;
  rationale: string;
  factIds: number[];
  sourceIds: number[];
};

export type ResearchSummary = {
  companyIdentity: CompanyIdentitySummary;
  growthPriorities: ResearchLinkedItem[];
  aiMaturityEstimate: {
    level: AiMaturityLevel;
    rationale: string;
    sourceIds: number[];
  };
  regulatorySensitivity: {
    level: RegulatorySensitivityLevel;
    rationale: string;
    sourceIds: number[];
  };
  notableProductSignals: ResearchLinkedItem[];
  notableHiringSignals: ResearchLinkedItem[];
  notableTrustSignals: ResearchLinkedItem[];
  complaintThemes: ResearchLinkedItem[];
  leadershipSocialThemes: ResearchLinkedItem[];
  researchCompletenessScore: number;
  confidenceBySection: ResearchConfidenceBySection[];
  evidenceGaps: string[];
  overallConfidence: ResearchConfidenceBand;
  sourceIds: number[];
};

export type FactPacket = {
  packetType: "fact_packet";
  packetVersion: 1;
  briefMode: "standard" | "light";
  companyIdentity: CompanyIdentitySummary;
  sourceRegistry: SourceRegistryEntry[];
  evidence: FactPacketEvidence[];
  sectionCoverage: FactPacketSectionCoverage[];
  evidenceGaps: string[];
  researchCompletenessScore: number;
  overallConfidence: ResearchConfidenceBand;
  sourceIds: number[];
  summary: ResearchSummary;
};

export type PersistedFactRecord = {
  claim: string;
  rationale: string | null;
  section: ReportSectionKey;
  classification: "fact" | "inference" | "hypothesis";
  confidence: number;
  freshness: "current" | "recent" | "stale" | "unknown";
  sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown";
  relevance: number;
  evidenceSnippet: string | null;
  sourceIds: number[];
};
