import type { AccountPlanUseCase, FinalAccountPlan } from "@/lib/types/account-plan";
import type { FactPacket, SourceRegistryEntry } from "@/lib/types/research";
import { normalizeCanonicalDomain } from "@/lib/url";

export type ReportQualityInvariantKey =
  | "entity_resolution_plausible_for_domain"
  | "display_name_supported_by_evidence"
  | "industry_and_business_model_plausible"
  | "top_opportunities_target_company"
  | "recommendations_grounded_in_evidence"
  | "transient_operational_pages_not_dominant"
  | "fallback_used_when_grounding_is_weak";

export type ReportQualityInvariantStatus = "pass" | "fail";
export type ReportQualityPublishRecommendation = "publish_full" | "publish_grounded_fallback" | "reject";
export type ReportQualityScorecardSection =
  | "entity_resolution"
  | "industry_grounding"
  | "relevance_of_top_opportunities"
  | "evidence_support"
  | "fallback_correctness";

export type ReportQualityInvariantResult = {
  key: ReportQualityInvariantKey;
  status: ReportQualityInvariantStatus;
  summary: string;
  evidenceSourceIds: number[];
};

export type ReportQualityScorecardEntry = {
  section: ReportQualityScorecardSection;
  status: ReportQualityInvariantStatus;
  summary: string;
  invariantKeys: ReportQualityInvariantKey[];
};

export type ReportQualityEvaluation = {
  recommendation: ReportQualityPublishRecommendation;
  shouldPublishFull: boolean;
  shouldPublishFallback: boolean;
  shouldReject: boolean;
  failedInvariantKeys: ReportQualityInvariantKey[];
  invariants: ReportQualityInvariantResult[];
  scorecard: ReportQualityScorecardEntry[];
};

export const TRANSIENT_OPERATIONAL_SIGNAL_PATTERNS = [
  /\bscheduled maintenance\b/i,
  /\bmaintenance\b/i,
  /\boutage\b/i,
  /\bdowntime\b/i,
  /\btemporarily unavailable\b/i,
  /\bservice unavailable\b/i,
  /\bbad gateway\b/i,
  /\bgateway timeout\b/i,
  /\borigin error\b/i,
  /\bserver error\b/i,
  /\bcdn error\b/i,
  /\bcloudflare\b/i,
  /\b502\b/i,
  /\b503\b/i,
  /\b504\b/i,
  /\bwe'?ll be back soon\b/i,
  /\bcheck back soon\b/i,
] as const;

export const SELLER_WORKFLOW_SELF_REFERENCE_PATTERNS = [
  { label: "account intelligence", pattern: /\baccount intelligence\b/i },
  { label: "discovery brief builder", pattern: /\bdiscovery brief builder\b/i },
  { label: "research prioritization copilot", pattern: /\bresearch prioritization copilot\b/i },
  { label: "seller workflow", pattern: /\bseller(?:[-\s/]+workflow|[-\s]+tooling)?\b/i },
  { label: "account planning", pattern: /\baccount[-\s]+planning\b/i },
  { label: "account plan", pattern: /\baccount[-\s]+plan(?:ning)?\b/i },
  { label: "seller tooling", pattern: /\bseller[-\s/]+tooling\b/i },
  { label: "research copilot", pattern: /\bresearch(?:[-\s]+prioritization)?\s+copilot\b/i },
] as const;

export const SELLER_WORKFLOW_BUSINESS_SUPPORT_PATTERNS = [
  /\baccount intelligence\b/i,
  /\bsales intelligence\b/i,
  /\brevenue intelligence\b/i,
  /\bsales enablement\b/i,
  /\bgo[-\s]?to[-\s]?market\b/i,
  /\bcrm\b/i,
  /\brev(?:enue)? ops\b/i,
  /\bprospecting\b/i,
  /\bsales engagement\b/i,
  /\baccount[-\s]+planning\b/i,
  /\bseller[-\s]+tooling\b/i,
] as const;

const BUSINESS_KEYWORD_STOP_WORDS = new Set([
  "about",
  "across",
  "after",
  "assistant",
  "brand",
  "business",
  "built",
  "capabilities",
  "client",
  "company",
  "customers",
  "digital",
  "enterprise",
  "focused",
  "global",
  "helps",
  "industry",
  "internal",
  "offers",
  "operating",
  "operations",
  "platform",
  "product",
  "public",
  "scale",
  "service",
  "services",
  "software",
  "solutions",
  "teams",
  "their",
  "through",
  "with",
]);

const FALLBACKABLE_INVARIANT_KEYS = new Set<ReportQualityInvariantKey>([
  "top_opportunities_target_company",
  "recommendations_grounded_in_evidence",
  "transient_operational_pages_not_dominant",
]);

function uniqueNumberList(values: number[]) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenizeBusinessText(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function extractHostnameDomain(url: string) {
  try {
    return normalizeCanonicalDomain(new URL(url).hostname);
  } catch {
    return null;
  }
}

function getSupportingSources(factPacket: FactPacket, sourceIds: number[]) {
  const sourceById = new Map(factPacket.sourceRegistry.map((source) => [source.sourceId, source]));

  return uniqueNumberList(sourceIds)
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is SourceRegistryEntry => Boolean(source));
}

function getVisibleUseCases(accountPlan: FinalAccountPlan | null | undefined) {
  if (!accountPlan) {
    return [];
  }

  if (accountPlan.publishMode === "grounded_fallback") {
    return accountPlan.candidateUseCases;
  }

  return accountPlan.topUseCases.length > 0 ? accountPlan.topUseCases : accountPlan.candidateUseCases.slice(0, 3);
}

function getRelationshipEvidenceSourceIds(factPacket: FactPacket) {
  return uniqueNumberList([
    ...factPacket.companyIdentity.sourceIds,
    ...factPacket.companyProfile.companyDescription.sourceIds,
    ...factPacket.companyProfile.productsServices.sourceIds,
    ...factPacket.companyProfile.operatingModel.sourceIds,
    ...factPacket.companyProfile.targetCustomers.sourceIds,
    ...factPacket.companyProfile.keyPublicSignals.flatMap((signal) => signal.sourceIds),
  ]);
}

function sourceSupportsCanonicalDomain(source: SourceRegistryEntry, canonicalDomain: string) {
  const sourceDomain = extractHostnameDomain(source.url);
  const normalizedCanonicalDomain = normalizeCanonicalDomain(canonicalDomain);

  if (!sourceDomain) {
    return false;
  }

  return (
    sourceDomain === normalizedCanonicalDomain ||
    sourceDomain.endsWith(`.${normalizedCanonicalDomain}`) ||
    normalizedCanonicalDomain.endsWith(`.${sourceDomain}`)
  );
}

function buildIdentityConfidence(factPacket: FactPacket) {
  const explicitConfidence = factPacket.companyIdentity.confidence;

  if (typeof explicitConfidence === "number") {
    return explicitConfidence;
  }

  switch (factPacket.overallConfidence) {
    case "high":
      return 88;
    case "medium":
      return 74;
    default:
      return 56;
  }
}

function cleanDisplayNameCandidate(value: string) {
  return value
    .replace(/[®™]/g, "")
    .replace(/\b(official site|home|homepage|about|company|investors?|careers|newsroom|docs|documentation)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSupportedDisplayNameCandidate(sources: SourceRegistryEntry[]) {
  const candidates = new Map<string, number>();

  for (const source of sources) {
    for (const rawText of [source.title, source.summary ?? ""]) {
      for (const segment of rawText.split(/[|•·:]/)) {
        const candidate = cleanDisplayNameCandidate(segment);

        if (!candidate || candidate.length < 5 || candidate.length > 80) {
          continue;
        }

        const words = candidate.split(/\s+/);

        if (words.length < 2 || words.length > 5) {
          continue;
        }

        const letterWordCount = words.filter((word) => /[A-Za-z]/.test(word)).length;

        if (letterWordCount < 2) {
          continue;
        }

        const score = words.length * 20 + candidate.length;
        const current = candidates.get(candidate) ?? 0;

        if (score > current) {
          candidates.set(candidate, score);
        }
      }
    }
  }

  return [...candidates.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function buildScorecardEntry(
  section: ReportQualityScorecardSection,
  invariantKeys: ReportQualityInvariantKey[],
  invariantMap: Map<ReportQualityInvariantKey, ReportQualityInvariantResult>,
): ReportQualityScorecardEntry {
  const invariants = invariantKeys
    .map((key) => invariantMap.get(key))
    .filter((entry): entry is ReportQualityInvariantResult => Boolean(entry));
  const failingInvariant = invariants.find((entry) => entry.status === "fail");

  return {
    section,
    status: failingInvariant ? "fail" : "pass",
    summary: failingInvariant?.summary ?? invariants[0]?.summary ?? "No quality signal was recorded.",
    invariantKeys,
  };
}

export function collectSellerWorkflowPatternHits(text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return [];
  }

  return SELLER_WORKFLOW_SELF_REFERENCE_PATTERNS.filter(({ pattern }) => pattern.test(normalized)).map(
    ({ label }) => label,
  );
}

export function isTransientOperationalSource(source: SourceRegistryEntry) {
  if (source.sourceType === "incident_page") {
    return true;
  }

  const haystack = `${source.title} ${source.summary ?? ""} ${source.url}`;

  return TRANSIENT_OPERATIONAL_SIGNAL_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function buildBusinessKeywordSet(factPacket: FactPacket) {
  const keywords = new Set<string>();

  for (const value of [
    factPacket.companyIdentity.businessModel,
    factPacket.companyIdentity.customerType,
    factPacket.companyIdentity.offerings,
    factPacket.companyIdentity.sector,
    factPacket.companyIdentity.industry,
    factPacket.companyProfile.companyDescription.value,
    factPacket.companyProfile.industry.value,
    factPacket.companyProfile.productsServices.value,
    factPacket.companyProfile.operatingModel.value,
    factPacket.companyProfile.targetCustomers.value,
    ...factPacket.companyProfile.keyPublicSignals.map((signal) => signal.summary),
  ]) {
    if (!value) {
      continue;
    }

    for (const token of tokenizeBusinessText(value)) {
      if (token.length < 4 || BUSINESS_KEYWORD_STOP_WORDS.has(token)) {
        continue;
      }

      keywords.add(token);
    }
  }

  return keywords;
}

export function useCaseMatchesBusinessContext(useCase: AccountPlanUseCase, factPacket: FactPacket) {
  const businessKeywords = buildBusinessKeywordSet(factPacket);

  if (businessKeywords.size === 0) {
    return useCase.scorecard.evidenceConfidence >= 80;
  }

  const useCaseTokens = new Set(
    tokenizeBusinessText(
      [
        useCase.workflowName,
        useCase.summary,
        useCase.painPoint,
        useCase.whyNow,
        useCase.expectedOutcome,
        useCase.motionRationale,
      ].join(" "),
    ),
  );

  for (const keyword of businessKeywords) {
    if (useCaseTokens.has(keyword)) {
      return true;
    }
  }

  return useCase.scorecard.evidenceConfidence >= 78;
}

export function companyBusinessSupportsSellerWorkflow(factPacket: FactPacket) {
  const businessContext = [
    factPacket.companyIdentity.archetype,
    factPacket.companyIdentity.businessModel,
    factPacket.companyIdentity.customerType,
    factPacket.companyIdentity.offerings,
    factPacket.companyIdentity.sector,
    factPacket.companyIdentity.industry,
    factPacket.companyProfile.companyDescription.value,
    factPacket.companyProfile.productsServices.value,
    factPacket.companyProfile.operatingModel.value,
    factPacket.companyProfile.targetCustomers.value,
    ...factPacket.companyProfile.keyPublicSignals.map((signal) => signal.summary),
    ...factPacket.evidence.slice(0, 12).map((fact) => fact.claim),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return SELLER_WORKFLOW_BUSINESS_SUPPORT_PATTERNS.some((pattern) => pattern.test(businessContext));
}

export function evaluateReportQualityInvariants(input: {
  canonicalDomain: string;
  factPacket: FactPacket;
  accountPlan: FinalAccountPlan | null | undefined;
}): ReportQualityEvaluation {
  const accountPlan = input.accountPlan;
  const publishMode = accountPlan?.publishMode ?? "full";
  const visibleUseCases = getVisibleUseCases(accountPlan);
  const sellerWorkflowSupported = companyBusinessSupportsSellerWorkflow(input.factPacket);
  const identitySources = getSupportingSources(input.factPacket, input.factPacket.companyIdentity.sourceIds);
  const relationshipSources = getSupportingSources(input.factPacket, getRelationshipEvidenceSourceIds(input.factPacket));
  const identityConfidence = buildIdentityConfidence(input.factPacket);
  const companyName = input.factPacket.companyIdentity.companyName.trim();
  const canonicalDomain = normalizeCanonicalDomain(input.canonicalDomain);
  const identityCanonicalDomain = input.factPacket.companyIdentity.canonicalDomain
    ? normalizeCanonicalDomain(input.factPacket.companyIdentity.canonicalDomain)
    : canonicalDomain;
  const canonicalLabel = canonicalDomain.split(".")[0] ?? canonicalDomain;
  const normalizedCompanyName = normalizeToken(companyName);
  const rawDomainLikeName =
    (/^[A-Z0-9]{2,4}$/.test(companyName) && !companyName.includes(" ")) ||
    (/^[a-z0-9]{2,4}$/.test(companyName) && normalizedCompanyName === normalizeToken(canonicalLabel));
  const expandedDisplayName = extractSupportedDisplayNameCandidate(identitySources);
  const identityEvidenceOnCanonicalDomain =
    identitySources.some((source) => sourceSupportsCanonicalDomain(source, canonicalDomain)) ||
    relationshipSources.some((source) => sourceSupportsCanonicalDomain(source, identityCanonicalDomain));
  const relationshipHint = input.factPacket.companyIdentity.relationshipToCanonicalDomain?.trim() ?? null;

  const entityResolutionInvariant: ReportQualityInvariantResult = {
    key: "entity_resolution_plausible_for_domain",
    status:
      companyName &&
      identitySources.length > 0 &&
      identityEvidenceOnCanonicalDomain &&
      (identityConfidence >= 60 || publishMode === "grounded_fallback")
        ? "pass"
        : "fail",
    summary:
      companyName &&
      identitySources.length > 0 &&
      identityEvidenceOnCanonicalDomain &&
      (identityConfidence >= 60 || publishMode === "grounded_fallback")
        ? relationshipHint
          ? `Entity resolution is plausible for ${canonicalDomain} and preserves the supported brand or parent relationship.`
          : `Entity resolution is plausible for ${canonicalDomain} and stays anchored to supported first-party or related-company evidence.`
        : `Entity resolution is too weak or unsupported for ${canonicalDomain}; the report should not publish until the company identity is better grounded.`,
    evidenceSourceIds: uniqueNumberList(relationshipSources.map((source) => source.sourceId)),
  };

  const displayNameInvariant: ReportQualityInvariantResult = {
    key: "display_name_supported_by_evidence",
    status:
      companyName &&
      identitySources.length > 0 &&
      (!rawDomainLikeName ||
        !expandedDisplayName ||
        normalizeToken(expandedDisplayName) === normalizedCompanyName)
        ? "pass"
        : "fail",
    summary:
      companyName &&
      identitySources.length > 0 &&
      (!rawDomainLikeName ||
        !expandedDisplayName ||
        normalizeToken(expandedDisplayName) === normalizedCompanyName)
        ? `The display name "${companyName}" is supported by the identity evidence.`
        : `The display name "${companyName}" looks like a raw acronym or domain label even though the evidence supports a cleaner company name such as "${expandedDisplayName}".`,
    evidenceSourceIds: uniqueNumberList(identitySources.map((source) => source.sourceId)),
  };

  const industrySourceIds = uniqueNumberList([
    ...input.factPacket.companyProfile.industry.sourceIds,
    ...input.factPacket.companyProfile.operatingModel.sourceIds,
    ...input.factPacket.companyProfile.targetCustomers.sourceIds,
    ...input.factPacket.companyProfile.productsServices.sourceIds,
    ...input.factPacket.companyIdentity.sourceIds,
  ]);
  const industryValue =
    input.factPacket.companyProfile.industry.value ??
    input.factPacket.companyIdentity.industry ??
    input.factPacket.companyIdentity.sector;
  const businessModelValue =
    input.factPacket.companyProfile.operatingModel.value ??
    input.factPacket.companyIdentity.businessModel ??
    input.factPacket.companyProfile.productsServices.value ??
    input.factPacket.companyIdentity.offerings;
  const customerValue =
    input.factPacket.companyProfile.targetCustomers.value ?? input.factPacket.companyIdentity.customerType;

  const industryInvariant: ReportQualityInvariantResult = {
    key: "industry_and_business_model_plausible",
    status:
      Boolean(industryValue && businessModelValue && industrySourceIds.length > 0 && customerValue)
        ? "pass"
        : "fail",
    summary:
      industryValue && businessModelValue && industrySourceIds.length > 0 && customerValue
        ? `Industry, business model, and customer grounding are plausible for ${companyName}.`
        : "Industry, business model, or customer grounding is still too thin to publish with confidence.",
    evidenceSourceIds: industrySourceIds,
  };

  const invalidUseCases = visibleUseCases.filter((useCase) => {
    const workflowText = [
      useCase.workflowName,
      useCase.summary,
      useCase.painPoint,
      useCase.whyNow,
      useCase.expectedOutcome,
      useCase.motionRationale,
    ].join(" ");
    const evidenceSources = getSupportingSources(input.factPacket, useCase.evidenceSourceIds);
    const sellerPatternHits = collectSellerWorkflowPatternHits(workflowText);

    return (
      useCase.evidenceSourceIds.length === 0 ||
      (!sellerWorkflowSupported && sellerPatternHits.length > 0) ||
      !useCaseMatchesBusinessContext(useCase, input.factPacket) ||
      (evidenceSources.length > 0 && evidenceSources.every(isTransientOperationalSource))
    );
  });
  const motionPatternHits = collectSellerWorkflowPatternHits(accountPlan?.overallAccountMotion.rationale ?? "");
  const motionSources = getSupportingSources(input.factPacket, accountPlan?.overallAccountMotion.evidenceSourceIds ?? []);
  const shouldRequireVisibleTopOpportunities = publishMode !== "grounded_fallback";
  const topOpportunityEvidenceSourceIds = uniqueNumberList(
    visibleUseCases.flatMap((useCase) => useCase.evidenceSourceIds),
  );

  const topOpportunityInvariant: ReportQualityInvariantResult = {
    key: "top_opportunities_target_company",
    status:
      (!shouldRequireVisibleTopOpportunities || visibleUseCases.length > 0) &&
      invalidUseCases.length === 0 &&
      (sellerWorkflowSupported || motionPatternHits.length === 0)
        ? "pass"
        : "fail",
    summary:
      (!shouldRequireVisibleTopOpportunities || visibleUseCases.length > 0) &&
      invalidUseCases.length === 0 &&
      (sellerWorkflowSupported || motionPatternHits.length === 0)
        ? publishMode === "grounded_fallback"
          ? "The fallback brief withheld full opportunity cards and kept any visible hypotheses aligned to the target company business."
          : "Visible opportunities stay aligned to the target company business and avoid seller-side workflow drift."
        : publishMode === "grounded_fallback"
          ? "The fallback brief still contains opportunity hypotheses that do not look company-specific enough."
          : "Visible opportunities drift away from the target company business or into seller-side workflow language.",
    evidenceSourceIds:
      topOpportunityEvidenceSourceIds.length > 0
        ? topOpportunityEvidenceSourceIds
        : uniqueNumberList(accountPlan?.overallAccountMotion.evidenceSourceIds ?? []),
  };
  const evidenceUnsupportedUseCases = visibleUseCases.filter((useCase) => {
    const evidenceSources = getSupportingSources(input.factPacket, useCase.evidenceSourceIds);
    return useCase.evidenceSourceIds.length === 0 || evidenceSources.length === 0 || evidenceSources.every(isTransientOperationalSource);
  });
  const fallbackSummarySources = getSupportingSources(
    input.factPacket,
    accountPlan?.groundedFallbackBrief?.sourceIds ?? [],
  );
  const motionHasStableEvidence =
    publishMode === "grounded_fallback" ||
    ((accountPlan?.overallAccountMotion.evidenceSourceIds.length ?? 0) > 0 &&
      motionSources.length > 0 &&
      motionSources.some((source) => !isTransientOperationalSource(source)));

  const evidenceSupportInvariant: ReportQualityInvariantResult = {
    key: "recommendations_grounded_in_evidence",
    status:
      publishMode === "grounded_fallback"
        ? Boolean(
            accountPlan?.groundedFallbackBrief?.summary &&
              accountPlan.groundedFallbackBrief.sourceIds.length > 0 &&
              fallbackSummarySources.length > 0 &&
              fallbackSummarySources.some((source) => !isTransientOperationalSource(source)) &&
              evidenceUnsupportedUseCases.length === 0,
          )
          ? "pass"
          : "fail"
        : Boolean(
              motionHasStableEvidence &&
                visibleUseCases.length > 0 &&
                evidenceUnsupportedUseCases.length === 0,
            )
          ? "pass"
          : "fail",
    summary:
      publishMode === "grounded_fallback"
        ? accountPlan?.groundedFallbackBrief?.summary &&
          accountPlan.groundedFallbackBrief.sourceIds.length > 0 &&
          fallbackSummarySources.length > 0 &&
          fallbackSummarySources.some((source) => !isTransientOperationalSource(source))
          ? "The grounded fallback brief keeps visible claims tied to cited evidence IDs."
          : "The grounded fallback brief is missing citation support for visible claims."
        : motionHasStableEvidence &&
            visibleUseCases.length > 0 &&
            evidenceUnsupportedUseCases.length === 0
          ? "The visible motion and opportunities are backed by cited evidence IDs."
          : "Visible recommendations are missing enough cited evidence support to publish safely.",
    evidenceSourceIds:
      publishMode === "grounded_fallback"
        ? uniqueNumberList([
            ...(accountPlan?.groundedFallbackBrief?.sourceIds ?? []),
            ...topOpportunityEvidenceSourceIds,
          ])
        : uniqueNumberList([
            ...(accountPlan?.overallAccountMotion.evidenceSourceIds ?? []),
            ...topOpportunityEvidenceSourceIds,
          ]),
  };

  const transientEvidenceFailingUseCases = visibleUseCases.filter((useCase) => {
    const evidenceSources = getSupportingSources(input.factPacket, useCase.evidenceSourceIds);
    return evidenceSources.length > 0 && evidenceSources.every(isTransientOperationalSource);
  });

  const transientInvariant: ReportQualityInvariantResult = {
    key: "transient_operational_pages_not_dominant",
    status:
      transientEvidenceFailingUseCases.length === 0 &&
      !(motionSources.length > 0 && motionSources.every(isTransientOperationalSource)) &&
      !(publishMode === "grounded_fallback" && fallbackSummarySources.length > 0 && fallbackSummarySources.every(isTransientOperationalSource))
        ? "pass"
        : "fail",
    summary:
      transientEvidenceFailingUseCases.length === 0 &&
      !(motionSources.length > 0 && motionSources.every(isTransientOperationalSource)) &&
      !(publishMode === "grounded_fallback" && fallbackSummarySources.length > 0 && fallbackSummarySources.every(isTransientOperationalSource))
        ? "Transient outage or maintenance pages do not dominate the visible report."
        : "Transient outage, maintenance, or status-only pages are carrying too much weight in the visible report.",
    evidenceSourceIds: uniqueNumberList([
      ...transientEvidenceFailingUseCases.flatMap((useCase) => useCase.evidenceSourceIds),
      ...(motionSources.length > 0 && motionSources.every(isTransientOperationalSource)
        ? accountPlan?.overallAccountMotion.evidenceSourceIds ?? []
        : []),
      ...(publishMode === "grounded_fallback" && fallbackSummarySources.every(isTransientOperationalSource)
        ? accountPlan?.groundedFallbackBrief?.sourceIds ?? []
        : []),
    ]),
  };

  const preliminaryInvariants = [
    entityResolutionInvariant,
    displayNameInvariant,
    industryInvariant,
    topOpportunityInvariant,
    evidenceSupportInvariant,
    transientInvariant,
  ];
  const preliminaryFailures = preliminaryInvariants
    .filter((invariant) => invariant.status === "fail")
    .map((invariant) => invariant.key);
  const onlyFallbackableFailures = preliminaryFailures.length > 0 && preliminaryFailures.every((key) => FALLBACKABLE_INVARIANT_KEYS.has(key));

  const fallbackInvariant: ReportQualityInvariantResult = {
    key: "fallback_used_when_grounding_is_weak",
    status:
      publishMode === "grounded_fallback"
        ? Boolean(
            accountPlan?.groundedFallbackBrief?.summary &&
              accountPlan.groundedFallbackBrief.sourceIds.length > 0 &&
              accountPlan.topUseCases.length === 0 &&
              preliminaryFailures.every((key) => FALLBACKABLE_INVARIANT_KEYS.has(key)),
          )
          ? "pass"
          : "fail"
        : preliminaryFailures.length === 0
          ? "pass"
          : "fail",
    summary:
      publishMode === "grounded_fallback"
        ? accountPlan?.groundedFallbackBrief?.summary &&
            accountPlan.groundedFallbackBrief.sourceIds.length > 0 &&
            accountPlan.topUseCases.length === 0 &&
            preliminaryFailures.every((key) => FALLBACKABLE_INVARIANT_KEYS.has(key))
          ? "Weak opportunity grounding correctly collapsed to a shorter grounded brief."
          : preliminaryFailures.some((key) => !FALLBACKABLE_INVARIANT_KEYS.has(key))
            ? "Grounding is too weak to publish even a fallback brief safely."
            : "The fallback brief still looks too polished or unsupported for the current grounding."
        : preliminaryFailures.length === 0
          ? "Full publish mode is justified by the current grounding and relevance checks."
          : onlyFallbackableFailures
            ? "The report should fall back to a shorter grounded brief instead of publishing the current full opportunity set."
            : "Grounding is too weak to publish either a full account brief or a grounded fallback safely.",
    evidenceSourceIds:
      publishMode === "grounded_fallback"
        ? uniqueNumberList(accountPlan?.groundedFallbackBrief?.sourceIds ?? [])
        : uniqueNumberList([
            ...entityResolutionInvariant.evidenceSourceIds,
            ...industryInvariant.evidenceSourceIds,
            ...evidenceSupportInvariant.evidenceSourceIds,
          ]),
  };

  const invariants = [...preliminaryInvariants, fallbackInvariant];
  const failedInvariantKeys = invariants
    .filter((invariant) => invariant.status === "fail")
    .map((invariant) => invariant.key);
  const fallbackRecommended =
    publishMode === "grounded_fallback"
      ? fallbackInvariant.status === "pass"
      : preliminaryFailures.length > 0 && onlyFallbackableFailures;
  const shouldReject =
    publishMode === "grounded_fallback"
      ? fallbackInvariant.status === "fail"
      : preliminaryFailures.some((key) => !FALLBACKABLE_INVARIANT_KEYS.has(key));
  const recommendation: ReportQualityPublishRecommendation =
    shouldReject ? "reject" : fallbackRecommended ? "publish_grounded_fallback" : "publish_full";
  const invariantMap = new Map(invariants.map((invariant) => [invariant.key, invariant]));

  return {
    recommendation,
    shouldPublishFull: recommendation === "publish_full",
    shouldPublishFallback: recommendation === "publish_grounded_fallback",
    shouldReject,
    failedInvariantKeys,
    invariants,
    scorecard: [
      buildScorecardEntry(
        "entity_resolution",
        ["entity_resolution_plausible_for_domain", "display_name_supported_by_evidence"],
        invariantMap,
      ),
      buildScorecardEntry("industry_grounding", ["industry_and_business_model_plausible"], invariantMap),
      buildScorecardEntry(
        "relevance_of_top_opportunities",
        ["top_opportunities_target_company", "transient_operational_pages_not_dominant"],
        invariantMap,
      ),
      buildScorecardEntry("evidence_support", ["recommendations_grounded_in_evidence"], invariantMap),
      buildScorecardEntry("fallback_correctness", ["fallback_used_when_grounding_is_weak"], invariantMap),
    ],
  };
}
