import "server-only";

import { REPORT_SECTION_DEFINITIONS } from "@/lib/report-sections";
import type { ReportSectionKey } from "@/lib/types/report";
import type {
  CompanyIdentitySummary,
  FactPacket,
  FactPacketSectionCoverage,
  ResearchConfidenceBand,
  ResearchLinkedItem,
} from "@/lib/types/research";
import type {
  PersistedArtifact,
  PersistedFact,
  PersistedSource,
  StoredRunContext,
} from "@/server/repositories/report-repository";
import { buildSourceRegistry } from "@/server/research/source-registry";

export const FACT_PACKET_ARTIFACT_FILE_NAME = "fact-packet.json";

function uniqueNumberList(values: number[]) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function toConfidenceBand(score: number): ResearchConfidenceBand {
  if (score >= 75) {
    return "high";
  }

  if (score >= 55) {
    return "medium";
  }

  return "low";
}

function summarizeSourceCoverage(sources: PersistedSource[], canonicalDomain: string) {
  const firstPartySources = sources.filter((source) => source.canonicalDomain === canonicalDomain);

  return {
    totalSources: sources.length,
    firstPartySources: firstPartySources.length,
    firstPartyCoverage: firstPartySources.length >= 2 ? "usable" : firstPartySources.length > 0 ? "limited" : "thin",
  };
}

export function deriveCompanyNameFromDomain(canonicalDomain: string) {
  const rootLabel = canonicalDomain.split(".")[0] ?? canonicalDomain;

  return rootLabel
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => {
      if (!/[aeiou]/i.test(segment) && segment.length <= 4) {
        return segment.toUpperCase();
      }

      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");
}

export function selectResearchBriefMode(
  sources: PersistedSource[],
  canonicalDomain: string,
): FactPacket["briefMode"] {
  const coverage = summarizeSourceCoverage(sources, canonicalDomain);

  if (sources.length <= 2) {
    return "light";
  }

  return coverage.firstPartyCoverage === "thin" ? "light" : "standard";
}

function buildCompanyIdentity(
  context: StoredRunContext,
  sources: PersistedSource[],
  facts: PersistedFact[],
): CompanyIdentitySummary {
  const preferredSourceIds = uniqueNumberList(
    sources
      .filter((source) =>
        ["company_homepage", "about_page", "product_page", "solutions_page", "company_site"].includes(source.sourceType),
      )
      .map((source) => source.id),
  );
  const fallbackSourceIds = uniqueNumberList([...preferredSourceIds, ...facts.flatMap((fact) => fact.sourceIds)]).slice(0, 3);
  const hasPlatformSignals = sources.some((source) =>
    ["product_page", "solutions_page", "developer_page", "docs_page"].includes(source.sourceType),
  );
  const hasTrustSignals = sources.some((source) =>
    ["security_page", "privacy_page", "status_page"].includes(source.sourceType),
  );

  return {
    companyName: context.report.companyName ?? deriveCompanyNameFromDomain(context.report.canonicalDomain),
    archetype: hasPlatformSignals
      ? "AI and software platform provider"
      : hasTrustSignals
        ? "Enterprise software provider"
        : "Company under research",
    businessModel: hasPlatformSignals ? "Software platform and enterprise services" : null,
    industry: null,
    publicCompany: sources.some((source) =>
      ["investor_relations_page", "investor_report", "earnings_release"].includes(source.sourceType),
    )
      ? true
      : null,
    headquarters: null,
    sourceIds: fallbackSourceIds.length > 0 ? fallbackSourceIds : sources[0] ? [sources[0].id] : [],
  };
}

function factsToLinkedItems(facts: PersistedFact[], limit: number): ResearchLinkedItem[] {
  return facts.slice(0, limit).map((fact) => ({
    summary: fact.statement,
    sourceIds: uniqueNumberList(fact.sourceIds),
  }));
}

function buildCoverageEntry(input: {
  section: ReportSectionKey;
  facts: PersistedFact[];
  sourceIds: number[];
  rationaleWhenCovered: string;
  rationaleWhenLimited: string;
  rationaleWhenMissing: string;
}): FactPacketSectionCoverage {
  const factIds = uniqueNumberList(input.facts.map((fact) => fact.id));
  const sourceIds = uniqueNumberList([...input.sourceIds, ...input.facts.flatMap((fact) => fact.sourceIds)]);
  const rawConfidence =
    sourceIds.length === 0 && factIds.length === 0
      ? 20
      : 34 + Math.min(4, factIds.length) * 11 + Math.min(3, sourceIds.length) * 8;
  const confidence = clampConfidence(rawConfidence);
  const status =
    sourceIds.length === 0 && factIds.length === 0 ? "missing" : confidence >= 72 ? "covered" : "limited";

  return {
    section: input.section,
    status,
    confidence,
    rationale:
      status === "covered"
        ? input.rationaleWhenCovered
        : status === "limited"
          ? input.rationaleWhenLimited
          : input.rationaleWhenMissing,
    factIds,
    sourceIds,
  };
}

export function buildFactPacket(input: {
  context: StoredRunContext;
  sources: PersistedSource[];
  facts: PersistedFact[];
  briefMode?: FactPacket["briefMode"];
}): FactPacket {
  const briefMode = input.briefMode ?? selectResearchBriefMode(input.sources, input.context.report.canonicalDomain);
  const companyIdentity = buildCompanyIdentity(input.context, input.sources, input.facts);
  const sourceRegistry = buildSourceRegistry(input.sources);
  const sourceIdsByType = new Map<string, number[]>();

  for (const source of input.sources) {
    const current = sourceIdsByType.get(source.sourceType) ?? [];
    current.push(source.id);
    sourceIdsByType.set(source.sourceType, current);
  }

  const sourceIdsForTypes = (sourceTypes: string[]) =>
    uniqueNumberList(sourceTypes.flatMap((sourceType) => sourceIdsByType.get(sourceType) ?? []));
  const factsMatchingSection = (section: ReportSectionKey) => input.facts.filter((fact) => fact.section === section);
  const factsMatchingSourceTypes = (sourceTypes: string[]) => {
    const eligibleIds = new Set(sourceIdsForTypes(sourceTypes));
    return input.facts.filter((fact) => fact.sourceIds.some((sourceId) => eligibleIds.has(sourceId)));
  };
  const relevantFacts = [...input.facts].sort((left, right) => right.relevance - left.relevance);
  const negativeFacts = input.facts.filter((fact) => ["negative", "mixed"].includes(fact.sentiment));

  const sectionCoverage: FactPacketSectionCoverage[] = [
    buildCoverageEntry({
      section: "company-brief",
      facts: factsMatchingSection("company-brief").length > 0 ? factsMatchingSection("company-brief") : relevantFacts.slice(0, 3),
      sourceIds: companyIdentity.sourceIds,
      rationaleWhenCovered: "Multiple sources support a usable company snapshot and executive summary.",
      rationaleWhenLimited: "A company snapshot is possible, but some identity or positioning details remain thin.",
      rationaleWhenMissing: "Company identity evidence is still too sparse for a confident brief.",
    }),
    buildCoverageEntry({
      section: "fact-base",
      facts: relevantFacts,
      sourceIds: uniqueNumberList(relevantFacts.flatMap((fact) => fact.sourceIds)),
      rationaleWhenCovered: "The fact packet contains a usable set of deduped evidence-backed claims.",
      rationaleWhenLimited: "A smaller fact packet is available, but some claims remain lightly supported.",
      rationaleWhenMissing: "The fact packet does not yet contain enough evidence-backed claims.",
    }),
    buildCoverageEntry({
      section: "ai-maturity-signals",
      facts: factsMatchingSection("ai-maturity-signals").length > 0
        ? factsMatchingSection("ai-maturity-signals")
        : factsMatchingSourceTypes(["product_page", "developer_page", "docs_page", "status_page", "security_page"]),
      sourceIds: sourceIdsForTypes(["product_page", "developer_page", "docs_page", "status_page", "security_page"]),
      rationaleWhenCovered: "Platform, trust, or operational signals are strong enough to characterize AI maturity.",
      rationaleWhenLimited: "Some maturity signals exist, but the public record is still incomplete.",
      rationaleWhenMissing: "AI maturity evidence remains too thin for a strong assessment.",
    }),
    buildCoverageEntry({
      section: "prioritized-use-cases",
      facts: relevantFacts.filter((fact) => fact.relevance >= 70).slice(0, 6),
      sourceIds: sourceIdsForTypes(["product_page", "solutions_page", "developer_page", "docs_page", "customer_page"]),
      rationaleWhenCovered: "The packet includes enough operational and product evidence to rank opportunities.",
      rationaleWhenLimited: "Some opportunity signals are present, but use-case ranking will need more explicit caveats.",
      rationaleWhenMissing: "Evidence is too sparse to rank multiple opportunities confidently.",
    }),
    buildCoverageEntry({
      section: "recommended-motion",
      facts: relevantFacts.filter((fact) => fact.relevance >= 72).slice(0, 5),
      sourceIds: sourceIdsForTypes(["product_page", "solutions_page", "developer_page", "docs_page", "security_page", "privacy_page"]),
      rationaleWhenCovered: "The packet contains enough product and deployment evidence to recommend a motion.",
      rationaleWhenLimited: "A motion can be recommended, but supporting evidence is incomplete.",
      rationaleWhenMissing: "There is not enough deployment evidence to support a motion recommendation.",
    }),
    buildCoverageEntry({
      section: "stakeholder-hypotheses",
      facts: relevantFacts.filter((fact) => fact.relevance >= 60).slice(0, 4),
      sourceIds: sourceIdsForTypes(["about_page", "careers_page", "company_homepage"]),
      rationaleWhenCovered: "Role and organizational signals are sufficient for seller-facing stakeholder hypotheses.",
      rationaleWhenLimited: "Stakeholder hypotheses are possible, but the buying map will remain directional.",
      rationaleWhenMissing: "There is not enough public evidence to form stakeholder hypotheses with confidence.",
    }),
    buildCoverageEntry({
      section: "objections",
      facts: negativeFacts.length > 0 ? negativeFacts : factsMatchingSourceTypes(["security_page", "privacy_page", "status_page"]),
      sourceIds: sourceIdsForTypes(["security_page", "privacy_page", "status_page", "review_platform", "complaint_forum"]),
      rationaleWhenCovered: "Trust, risk, or negative-signal evidence can support objection handling.",
      rationaleWhenLimited: "Only partial objection evidence is available.",
      rationaleWhenMissing: "Public objection evidence is too thin to do more than note open questions.",
    }),
    buildCoverageEntry({
      section: "discovery-questions",
      facts: relevantFacts.slice(0, 5),
      sourceIds: uniqueNumberList(relevantFacts.flatMap((fact) => fact.sourceIds)),
      rationaleWhenCovered: "The packet contains enough evidence and gaps to frame discovery questions.",
      rationaleWhenLimited: "Discovery questions can be drafted, but they will need stronger validation.",
      rationaleWhenMissing: "There is not enough evidence to ground discovery questions.",
    }),
    buildCoverageEntry({
      section: "pilot-plan",
      facts: relevantFacts.filter((fact) => fact.relevance >= 68).slice(0, 5),
      sourceIds: sourceIdsForTypes(["product_page", "solutions_page", "security_page", "privacy_page"]),
      rationaleWhenCovered: "The packet contains enough evidence to frame a bounded pilot plan.",
      rationaleWhenLimited: "A pilot can be framed, but some scope assumptions remain weakly supported.",
      rationaleWhenMissing: "Evidence is too sparse to frame a credible pilot plan.",
    }),
    buildCoverageEntry({
      section: "expansion-scenarios",
      facts: relevantFacts.filter((fact) => fact.relevance >= 65).slice(0, 5),
      sourceIds: sourceIdsForTypes(["product_page", "solutions_page", "customer_page", "careers_page"]),
      rationaleWhenCovered: "The packet includes enough growth and product evidence to sketch expansion paths.",
      rationaleWhenLimited: "Expansion paths are directional only because evidence is incomplete.",
      rationaleWhenMissing: "There is not enough evidence to model realistic expansion scenarios.",
    }),
  ];

  const researchCompletenessScore = clampConfidence(
    average(sectionCoverage.map((entry) => entry.confidence)) + (briefMode === "light" ? -8 : 0),
  );
  const overallConfidence = toConfidenceBand(researchCompletenessScore);
  const packetSourceIds = uniqueNumberList([
    ...companyIdentity.sourceIds,
    ...input.facts.flatMap((fact) => fact.sourceIds),
  ]);
  const evidenceGaps = sectionCoverage
    .filter((entry) => entry.status !== "covered")
    .map((entry) => {
      const label = REPORT_SECTION_DEFINITIONS.find((section) => section.key === entry.section)?.label ?? entry.section;
      return `${label} evidence is ${entry.status === "missing" ? "missing" : "still thin"}.`;
    });

  const aiCoverage = sectionCoverage.find((entry) => entry.section === "ai-maturity-signals");
  const trustSourceIds = uniqueNumberList([
    ...sourceIdsForTypes(["security_page", "privacy_page", "status_page"]),
    ...negativeFacts.flatMap((fact) => fact.sourceIds),
  ]);

  const summary = {
    companyIdentity,
    growthPriorities: factsToLinkedItems(relevantFacts.filter((fact) => fact.relevance >= 80), 3),
    aiMaturityEstimate: {
      level:
        (aiCoverage?.confidence ?? 0) >= 80
          ? "advanced"
          : (aiCoverage?.confidence ?? 0) >= 60
            ? "moderate"
            : "emerging",
      rationale:
        factsMatchingSection("ai-maturity-signals")[0]?.statement ??
        "Available public signals indicate some AI and platform maturity, but evidence remains incomplete.",
      sourceIds: aiCoverage?.sourceIds.length ? aiCoverage.sourceIds : companyIdentity.sourceIds,
    },
    regulatorySensitivity: {
      level: trustSourceIds.length >= 3 ? "medium" : "low",
      rationale:
        factsMatchingSourceTypes(["security_page", "privacy_page", "status_page"])[0]?.statement ??
        "Trust, privacy, and operational evidence remain limited in the public record.",
      sourceIds: trustSourceIds.length ? trustSourceIds : companyIdentity.sourceIds,
    },
    notableProductSignals: factsToLinkedItems(
      factsMatchingSourceTypes(["product_page", "solutions_page", "developer_page", "docs_page"]),
      3,
    ),
    notableHiringSignals: factsToLinkedItems(factsMatchingSourceTypes(["careers_page"]), 2),
    notableTrustSignals: factsToLinkedItems(
      factsMatchingSourceTypes(["security_page", "privacy_page", "status_page"]),
      3,
    ),
    complaintThemes: factsToLinkedItems(negativeFacts, 2),
    leadershipSocialThemes: [] as ResearchLinkedItem[],
    researchCompletenessScore,
    confidenceBySection: sectionCoverage.map((entry) => ({
      section: entry.section,
      confidence: entry.confidence,
      rationale: entry.rationale,
    })),
    evidenceGaps,
    overallConfidence,
    sourceIds: packetSourceIds.length > 0 ? packetSourceIds : companyIdentity.sourceIds,
  } satisfies FactPacket["summary"];

  return {
    packetType: "fact_packet",
    packetVersion: 1,
    briefMode,
    companyIdentity,
    sourceRegistry,
    evidence: input.facts.map((fact) => ({
      factId: fact.id,
      section: fact.section,
      classification: fact.classification,
      claim: fact.statement,
      rationale: fact.rationale,
      confidence: fact.confidence,
      freshness: fact.freshness,
      sentiment: fact.sentiment,
      relevance: fact.relevance,
      evidenceSnippet: fact.evidenceSnippet,
      sourceIds: uniqueNumberList(fact.sourceIds),
    })),
    sectionCoverage,
    evidenceGaps,
    researchCompletenessScore,
    overallConfidence,
    sourceIds: summary.sourceIds,
    summary,
  };
}

export function parseFactPacketArtifact(artifacts: PersistedArtifact[]) {
  const packetArtifact = artifacts.find((artifact) => artifact.artifactType === "structured_json");
  const inlineJson =
    packetArtifact && typeof packetArtifact.storagePointers.inlineJson === "string"
      ? packetArtifact.storagePointers.inlineJson
      : null;

  if (!inlineJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(inlineJson) as FactPacket;
    return parsed.packetType === "fact_packet" && parsed.packetVersion === 1 ? parsed : null;
  } catch {
    return null;
  }
}
