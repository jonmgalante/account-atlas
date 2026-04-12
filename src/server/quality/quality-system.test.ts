import { describe, expect, it } from "vitest";

import type { SourceType } from "@/lib/source";
import type { AccountPlanUseCase, FinalAccountPlan, UseCaseDepartment } from "@/lib/types/account-plan";
import type { FactPacket, ResearchConfidenceBand, SourceRegistryEntry } from "@/lib/types/research";
import { extractCanonicalDomain, safeNormalizeCompanyUrl } from "@/lib/url";
import { buildInitialCrawlCandidates } from "@/server/crawl/source-discovery";
import { evaluateReportQualityInvariants, type ReportQualityInvariantKey } from "@/server/quality/report-quality";

const FIXTURE_TIMESTAMP = "2026-04-12T12:00:00.000Z";

type FixtureSourceInput = {
  id: number;
  title: string;
  url: string;
  sourceType: SourceType;
  summary: string;
  sourceTier?: SourceRegistryEntry["sourceTier"];
};

type FixtureUseCaseInput = {
  department: UseCaseDepartment;
  workflowName: string;
  summary: string;
  painPoint: string;
  whyNow: string;
  expectedOutcome: string;
  evidenceSourceIds: number[];
  recommendedMotion?: AccountPlanUseCase["recommendedMotion"];
  motionRationale?: string;
  evidenceConfidence?: number;
};

type FixtureScenarioInput = {
  canonicalDomain: string;
  companyName: string;
  archetype: string;
  industry: string;
  sector?: string;
  businessModel: string;
  offerings: string;
  targetCustomers: string;
  companyDescription: string;
  relationshipToCanonicalDomain?: string | null;
  publicCompany?: boolean;
  confidence?: number;
  overallConfidence?: ResearchConfidenceBand;
  sources: FixtureSourceInput[];
  keyPublicSignals?: Array<{ summary: string; sourceIds: number[] }>;
};

function createSource(input: FixtureSourceInput): SourceRegistryEntry {
  return {
    sourceId: input.id,
    title: input.title,
    url: input.url,
    sourceType: input.sourceType,
    sourceTier: input.sourceTier ?? "primary",
    publishedAt: null,
    retrievedAt: FIXTURE_TIMESTAMP,
    summary: input.summary,
    availableInFileSearch: true,
  };
}

function createFactPacket(input: FixtureScenarioInput): FactPacket {
  const sources = input.sources.map(createSource);
  const sourceIds = sources.map((source) => source.sourceId);
  const keyPublicSignals =
    input.keyPublicSignals ?? [{ summary: input.companyDescription, sourceIds: [sources[0]?.sourceId ?? 1] }];
  const overallConfidence = input.overallConfidence ?? "high";
  const researchCompletenessScore = overallConfidence === "high" ? 88 : overallConfidence === "medium" ? 74 : 58;
  const companyIdentity = {
    canonicalDomain: input.canonicalDomain,
    companyName: input.companyName,
    relationshipToCanonicalDomain: input.relationshipToCanonicalDomain ?? null,
    archetype: input.archetype,
    businessModel: input.businessModel,
    customerType: input.targetCustomers,
    offerings: input.offerings,
    sector: input.sector ?? input.industry,
    industry: input.industry,
    publicCompany: input.publicCompany ?? false,
    headquarters: null,
    confidence: input.confidence ?? (overallConfidence === "high" ? 90 : overallConfidence === "medium" ? 78 : 58),
    sourceIds,
  };

  return {
    packetType: "fact_packet",
    packetVersion: 1,
    briefMode: overallConfidence === "low" ? "light" : "standard",
    companyIdentity,
    companyProfile: {
      companyDescription: {
        value: input.companyDescription,
        sourceIds,
        confidence: companyIdentity.confidence ?? 80,
      },
      industry: {
        value: input.industry,
        sourceIds,
        confidence: companyIdentity.confidence ?? 80,
      },
      productsServices: {
        value: input.offerings,
        sourceIds,
        confidence: companyIdentity.confidence ?? 80,
      },
      operatingModel: {
        value: input.businessModel,
        sourceIds,
        confidence: companyIdentity.confidence ?? 80,
      },
      targetCustomers: {
        value: input.targetCustomers,
        sourceIds,
        confidence: companyIdentity.confidence ?? 80,
      },
      keyPublicSignals,
    },
    sourceRegistry: sources,
    evidence: [
      {
        factId: 1,
        section: "company-brief",
        classification: "fact",
        claim: input.companyDescription,
        rationale: null,
        confidence: companyIdentity.confidence ?? 80,
        freshness: "current",
        sentiment: "neutral",
        relevance: 92,
        evidenceSnippet: null,
        sourceIds,
      },
      {
        factId: 2,
        section: "fact-base",
        classification: "fact",
        claim: input.offerings,
        rationale: null,
        confidence: companyIdentity.confidence ?? 80,
        freshness: "current",
        sentiment: "neutral",
        relevance: 90,
        evidenceSnippet: null,
        sourceIds,
      },
      {
        factId: 3,
        section: "prioritized-use-cases",
        classification: "fact",
        claim: input.targetCustomers,
        rationale: null,
        confidence: companyIdentity.confidence ?? 80,
        freshness: "current",
        sentiment: "neutral",
        relevance: 86,
        evidenceSnippet: null,
        sourceIds,
      },
    ],
    sectionCoverage: [],
    evidenceGaps: overallConfidence === "low" ? ["Opportunity evidence remains thin."] : [],
    researchCompletenessScore,
    overallConfidence,
    sourceIds,
    summary: {
      companyIdentity,
      growthPriorities: [],
      aiMaturityEstimate: {
        level: overallConfidence === "high" ? "advanced" : overallConfidence === "medium" ? "moderate" : "emerging",
        rationale: keyPublicSignals[0]?.summary ?? input.companyDescription,
        sourceIds,
      },
      regulatorySensitivity: {
        level: input.archetype.includes("regulated") || input.industry.includes("Financial") ? "high" : "medium",
        rationale: input.companyDescription,
        sourceIds,
      },
      notableProductSignals: keyPublicSignals,
      notableHiringSignals: [],
      notableTrustSignals: [],
      complaintThemes: [],
      leadershipSocialThemes: [],
      researchCompletenessScore,
      confidenceBySection: [],
      evidenceGaps: overallConfidence === "low" ? ["Opportunity evidence remains thin."] : [],
      overallConfidence,
      sourceIds,
    },
  };
}

function createUseCase(input: FixtureUseCaseInput, priorityRank: number): AccountPlanUseCase {
  const evidenceConfidence = input.evidenceConfidence ?? 86;

  return {
    priorityRank,
    department: input.department,
    workflowName: input.workflowName,
    summary: input.summary,
    painPoint: input.painPoint,
    whyNow: input.whyNow,
    likelyUsers: ["Business operators"],
    expectedOutcome: input.expectedOutcome,
    metrics: ["Time to resolution"],
    dependencies: ["Current knowledge base"],
    securityComplianceNotes: [],
    recommendedMotion: input.recommendedMotion ?? "workspace",
    motionRationale: input.motionRationale ?? "Knowledge-heavy work can start with grounded internal and public content.",
    evidenceSourceIds: input.evidenceSourceIds,
    openQuestions: ["Which system owns this workflow today?"],
    scorecard: {
      businessValue: 84,
      deploymentReadiness: 80,
      expansionPotential: 78,
      openaiFit: 85,
      sponsorLikelihood: 77,
      evidenceConfidence,
      riskPenalty: 12,
      priorityScore: 80.1 - priorityRank,
    },
  };
}

function createFullAccountPlan(useCases: FixtureUseCaseInput[], motionRationale: string, motionEvidenceSourceIds = [1, 2]): FinalAccountPlan {
  const rankedUseCases = useCases.map((useCase, index) => createUseCase(useCase, index + 1));

  return {
    publishMode: "full",
    groundedFallbackBrief: null,
    overallAccountMotion: {
      recommendedMotion: "workspace",
      rationale: motionRationale,
      evidenceSourceIds: motionEvidenceSourceIds,
    },
    candidateUseCases: rankedUseCases,
    topUseCases: rankedUseCases.slice(0, 3),
    stakeholderHypotheses: [],
    objectionsAndRebuttals: [],
    discoveryQuestions: [],
    pilotPlan: null,
    expansionScenarios: {
      low: null,
      base: null,
      high: null,
    },
  };
}

function createGroundedFallbackPlan(summary: string, sourceIds: number[], hypotheses: FixtureUseCaseInput[] = []): FinalAccountPlan {
  const candidateUseCases = hypotheses.map((useCase, index) => createUseCase(useCase, index + 1));

  return {
    publishMode: "grounded_fallback",
    groundedFallbackBrief: {
      summary,
      sourceIds,
      opportunityHypothesisNote:
        candidateUseCases.length > 0
          ? "These hypotheses remain directional and should be validated against stronger company evidence."
          : "Opportunity recommendations were intentionally held back because grounding stayed weak.",
    },
    overallAccountMotion: {
      recommendedMotion: "undetermined",
      rationale: "The account motion remains undetermined until stronger company-specific evidence is available.",
      evidenceSourceIds: [],
    },
    candidateUseCases,
    topUseCases: [],
    stakeholderHypotheses: [],
    objectionsAndRebuttals: [],
    discoveryQuestions: [],
    pilotPlan: null,
    expansionScenarios: {
      low: null,
      base: null,
      high: null,
    },
  };
}

const archetypeFixtures = [
  {
    label: "consumer brand",
    inputUrl: "https://beanbuzz.example/",
    factPacket: createFactPacket({
      canonicalDomain: "beanbuzz.example",
      companyName: "BeanBuzz",
      archetype: "consumer brand",
      industry: "Retail beverages",
      businessModel: "Direct-to-consumer retail",
      offerings: "BeanBuzz sells coffee drinks, packaged beans, and loyalty memberships through retail cafes.",
      targetCustomers: "Retail guests and loyalty members",
      companyDescription: "BeanBuzz operates a consumer coffee brand with retail cafes and loyalty programs.",
      sources: [
        {
          id: 1,
          title: "BeanBuzz | Coffee drinks and rewards",
          url: "https://beanbuzz.example/",
          sourceType: "company_homepage",
          summary: "BeanBuzz serves coffee drinks and rewards members through company-operated cafes.",
        },
        {
          id: 2,
          title: "About BeanBuzz",
          url: "https://beanbuzz.example/about",
          sourceType: "about_page",
          summary: "BeanBuzz runs cafes, packaged coffee, and a loyalty membership program.",
        },
      ],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "operations",
          workflowName: "Store menu knowledge assistant",
          summary: "Give cafe teams faster answers on menu, allergens, and seasonal drink launches.",
          painPoint: "Store staff lose time searching menu and launch details during busy guest traffic.",
          whyNow: "BeanBuzz publicly emphasizes seasonal beverages, retail cafes, and guest experience.",
          expectedOutcome: "Faster guest answers and cleaner menu execution across cafes.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "customer_support",
          workflowName: "Loyalty member support assistant",
          summary: "Help rewards teams resolve guest questions about points, promotions, and memberships.",
          painPoint: "Support teams have to interpret changing rewards rules for retail guests.",
          whyNow: "Public materials highlight loyalty memberships and promotions as core parts of the brand.",
          expectedOutcome: "Faster loyalty issue handling and clearer guest communications.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "marketing",
          workflowName: "Store launch content assistant",
          summary: "Prepare localized launch content for new drinks, packaged beans, and in-store signage.",
          painPoint: "Retail launch teams need to adapt repeated brand content for many cafes.",
          whyNow: "BeanBuzz regularly introduces seasonal beverages and retail campaigns.",
          expectedOutcome: "Faster launch preparation and better consistency across stores.",
          evidenceSourceIds: [1, 2],
        },
      ],
      "A workspace-first motion fits BeanBuzz because the strongest public evidence centers on retail knowledge, loyalty content, and guest support workflows.",
    ),
  },
  {
    label: "franchise or restaurant brand",
    inputUrl: "https://quickbite.example/restaurants",
    factPacket: createFactPacket({
      canonicalDomain: "quickbite.example",
      companyName: "QuickBite",
      archetype: "franchise or restaurant brand",
      industry: "Quick-service restaurants",
      businessModel: "Franchised restaurant brand",
      offerings: "QuickBite sells restaurant meals through franchised quick-service locations.",
      targetCustomers: "Restaurant guests and franchise operators",
      companyDescription: "QuickBite operates a quick-service restaurant brand supported by franchise operators.",
      relationshipToCanonicalDomain: "QuickBite is a restaurant brand of Hearth Foods Group.",
      sources: [
        {
          id: 1,
          title: "QuickBite | Burgers and restaurant offers",
          url: "https://quickbite.example/",
          sourceType: "company_homepage",
          summary: "QuickBite serves restaurant guests through a global network of franchise locations.",
        },
        {
          id: 2,
          title: "QuickBite company and community",
          url: "https://quickbite.example/company",
          sourceType: "about_page",
          summary: "QuickBite supports franchise operators and restaurant teams.",
        },
        {
          id: 3,
          title: "Hearth Foods Group brands",
          url: "https://hearthfoods.example/investors/brands",
          sourceType: "investor_relations_page",
          summary: "Hearth Foods Group lists QuickBite as one of its restaurant brands.",
          sourceTier: "secondary",
        },
      ],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "operations",
          workflowName: "Franchise operations assistant",
          summary: "Help restaurant operators find current franchise playbooks, food safety steps, and launch guidance.",
          painPoint: "Franchise teams search across scattered restaurant operations materials.",
          whyNow: "Public sources show QuickBite depends on franchise operators and restaurant consistency.",
          expectedOutcome: "Faster restaurant issue resolution and cleaner launch execution.",
          evidenceSourceIds: [1, 2, 3],
          recommendedMotion: "hybrid",
        },
        {
          department: "customer_support",
          workflowName: "Guest order support assistant",
          summary: "Draft grounded responses for restaurant guest questions about orders, promotions, and menu availability.",
          painPoint: "Guest support teams need restaurant-specific context for promotions and order issues.",
          whyNow: "QuickBite publicly promotes offers and restaurant guest experience.",
          expectedOutcome: "Clearer guest support and better order-resolution speed.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "marketing",
          workflowName: "Menu launch knowledge assistant",
          summary: "Support restaurant launch teams with grounded FAQ content for new menu items and promotions.",
          painPoint: "Restaurant launches require repeated training and guest-facing content updates.",
          whyNow: "Brand and parent-company pages both emphasize menu promotions and brand campaigns.",
          expectedOutcome: "More consistent menu launches across restaurants.",
          evidenceSourceIds: [1, 2, 3],
        },
      ],
      "QuickBite's strongest public signals point to knowledge-heavy restaurant and franchise workflows that can start with a workspace-led rollout and expand into operational systems later.",
      [1, 2, 3],
    ),
  },
  {
    label: "public enterprise",
    inputUrl: "https://motorworks.example/investors/q1",
    factPacket: createFactPacket({
      canonicalDomain: "motorworks.example",
      companyName: "MotorWorks",
      archetype: "public enterprise",
      industry: "Automotive manufacturing",
      businessModel: "Public enterprise manufacturer",
      offerings: "MotorWorks sells vehicles, fleet services, and dealer support programs.",
      targetCustomers: "Vehicle buyers, fleet operators, and dealer networks",
      companyDescription: "MotorWorks is a public automotive manufacturer serving consumers, fleets, and dealers.",
      publicCompany: true,
      sources: [
        {
          id: 1,
          title: "MotorWorks | Vehicles and services",
          url: "https://motorworks.example/",
          sourceType: "company_homepage",
          summary: "MotorWorks sells vehicles and after-sales services through dealers and fleet programs.",
        },
        {
          id: 2,
          title: "MotorWorks investors",
          url: "https://motorworks.example/investors",
          sourceType: "investor_relations_page",
          summary: "MotorWorks reports on vehicle demand, fleet programs, and dealer execution.",
        },
      ],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "operations",
          workflowName: "Dealer service knowledge assistant",
          summary: "Help dealer teams answer service and warranty questions using current vehicle guidance.",
          painPoint: "Dealer service staff lose time searching vehicle bulletins and policy updates.",
          whyNow: "MotorWorks publicly highlights dealer and after-sales service programs.",
          expectedOutcome: "Faster dealer support and cleaner service execution.",
          evidenceSourceIds: [1, 2],
          recommendedMotion: "hybrid",
        },
        {
          department: "customer_support",
          workflowName: "Fleet support assistant",
          summary: "Support fleet teams with grounded answers on vehicle programs, service windows, and delivery updates.",
          painPoint: "Fleet account teams need current program information across vehicles and services.",
          whyNow: "Investor materials emphasize fleet programs and service execution.",
          expectedOutcome: "Better fleet communications and fewer manual escalations.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "engineering",
          workflowName: "Manufacturing bulletin assistant",
          summary: "Summarize production and service bulletins for engineering and field teams.",
          painPoint: "Field and engineering teams spend too much time interpreting repeated bulletin content.",
          whyNow: "MotorWorks operates as a large public manufacturer with distributed service workflows.",
          expectedOutcome: "Faster field alignment on product and service updates.",
          evidenceSourceIds: [1, 2],
          recommendedMotion: "hybrid",
        },
      ],
      "MotorWorks should start with a hybrid motion because dealer, fleet, and field workflows need grounded knowledge plus hooks into operational systems.",
      [1, 2],
    ),
  },
  {
    label: "B2B SaaS",
    inputUrl: "https://cloudsuite.example/platform",
    factPacket: createFactPacket({
      canonicalDomain: "cloudsuite.example",
      companyName: "CloudSuite",
      archetype: "B2B SaaS",
      industry: "Enterprise software",
      businessModel: "Subscription B2B SaaS platform",
      offerings: "CloudSuite sells workflow automation software, onboarding services, and support plans.",
      targetCustomers: "IT, operations, and revenue teams at mid-market and enterprise companies",
      companyDescription: "CloudSuite is a B2B SaaS company that sells workflow automation software to enterprises.",
      sources: [
        {
          id: 1,
          title: "CloudSuite workflow platform",
          url: "https://cloudsuite.example/",
          sourceType: "company_homepage",
          summary: "CloudSuite sells workflow automation and analytics software to enterprise teams.",
        },
        {
          id: 2,
          title: "CloudSuite customers",
          url: "https://cloudsuite.example/customers",
          sourceType: "customer_page",
          summary: "CloudSuite highlights enterprise onboarding, support, and adoption use cases.",
        },
      ],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "customer_support",
          workflowName: "Support triage assistant",
          summary: "Draft grounded responses and route issues across CloudSuite support teams.",
          painPoint: "Support teams have to interpret product context across many workflow features.",
          whyNow: "CloudSuite publicly emphasizes enterprise support and adoption.",
          expectedOutcome: "Faster ticket handling and clearer escalation paths.",
          evidenceSourceIds: [1, 2],
          recommendedMotion: "hybrid",
        },
        {
          department: "success_services",
          workflowName: "Onboarding summary assistant",
          summary: "Summarize implementation details for customer onboarding and services teams.",
          painPoint: "Services teams repeat the same implementation guidance across enterprise deployments.",
          whyNow: "Customer stories emphasize onboarding and deployment complexity.",
          expectedOutcome: "Faster onboarding and fewer repetitive handoff meetings.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "product",
          workflowName: "Feature feedback synthesis assistant",
          summary: "Aggregate enterprise feature requests and support trends into product-ready summaries.",
          painPoint: "Product teams spend time interpreting repeated customer feedback from software accounts.",
          whyNow: "CloudSuite markets workflow features across multiple enterprise teams.",
          expectedOutcome: "Cleaner product insight synthesis and prioritization.",
          evidenceSourceIds: [1, 2],
        },
      ],
      "CloudSuite should start with a hybrid motion because support and onboarding workflows need both grounded knowledge and system-connected actions.",
      [1, 2],
    ),
  },
  {
    label: "docs-heavy developer company",
    inputUrl: "https://docsforge.example/docs/sdk/start",
    factPacket: createFactPacket({
      canonicalDomain: "docsforge.example",
      companyName: "DocsForge",
      archetype: "docs-heavy developer company",
      industry: "Developer tools",
      businessModel: "Developer platform and documentation subscription",
      offerings: "DocsForge sells developer APIs, SDKs, and managed documentation tooling.",
      targetCustomers: "Software teams, platform engineers, and developer relations teams",
      companyDescription: "DocsForge provides developer APIs and documentation tooling for software teams.",
      sources: [
        {
          id: 1,
          title: "DocsForge developer platform",
          url: "https://docsforge.example/",
          sourceType: "company_homepage",
          summary: "DocsForge offers APIs, SDKs, and documentation tooling for developers.",
        },
        {
          id: 2,
          title: "DocsForge docs",
          url: "https://docsforge.example/docs",
          sourceType: "docs_page",
          summary: "DocsForge documentation explains SDK setup, API workflows, and developer guidance.",
        },
      ],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "engineering",
          workflowName: "Developer documentation assistant",
          summary: "Help developers find the right SDK, API, and migration guidance faster.",
          painPoint: "Developers lose time navigating fragmented API and SDK documentation.",
          whyNow: "DocsForge publicly emphasizes APIs, SDKs, and documentation workflows.",
          expectedOutcome: "Faster implementation and fewer documentation support requests.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "product",
          workflowName: "API migration assistant",
          summary: "Summarize changelog and migration steps for product and platform teams.",
          painPoint: "Platform teams struggle to translate docs changes into concrete migration steps.",
          whyNow: "The docs site highlights ongoing API and SDK evolution.",
          expectedOutcome: "Cleaner migration planning and faster adoption of new APIs.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "customer_support",
          workflowName: "Developer support assistant",
          summary: "Support developer relations teams with grounded answers on API setup and SDK usage.",
          painPoint: "Support teams need to answer repeated technical questions with accurate doc grounding.",
          whyNow: "Docs-heavy companies live or die on developer onboarding quality.",
          expectedOutcome: "Faster developer support and more consistent technical guidance.",
          evidenceSourceIds: [1, 2],
        },
      ],
      "DocsForge can start with a workspace-led motion because the strongest opportunities center on high-volume documentation and developer knowledge workflows.",
      [1, 2],
    ),
  },
  {
    label: "thin brand site with parent-company context",
    inputUrl: "https://sparklewater.example/",
    factPacket: createFactPacket({
      canonicalDomain: "sparklewater.example",
      companyName: "Sparkle Water",
      archetype: "thin brand site with parent-company context",
      industry: "Packaged beverages",
      businessModel: "Consumer packaged goods brand",
      offerings: "Sparkle Water sells flavored sparkling water through retail channels.",
      targetCustomers: "Retail shoppers and grocery buyers",
      companyDescription: "Sparkle Water is a flavored sparkling water brand sold through retail channels.",
      relationshipToCanonicalDomain: "Sparkle Water is a beverage brand of Northstar Beverages.",
      sources: [
        {
          id: 1,
          title: "Sparkle Water | Flavored sparkling water",
          url: "https://sparklewater.example/",
          sourceType: "company_homepage",
          summary: "Sparkle Water markets flavored sparkling water for retail shoppers.",
        },
        {
          id: 2,
          title: "Northstar Beverages brands",
          url: "https://northstarbeverages.example/investors/brands",
          sourceType: "investor_relations_page",
          summary: "Northstar Beverages lists Sparkle Water as one of its retail beverage brands.",
          sourceTier: "secondary",
        },
      ],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "marketing",
          workflowName: "Retail campaign knowledge assistant",
          summary: "Support brand teams with grounded campaign and product-launch knowledge for retail channels.",
          painPoint: "Brand teams repeat product and campaign context across retailers and agencies.",
          whyNow: "The brand site is thin, so parent-company context is important for launch planning.",
          expectedOutcome: "Faster retail campaign preparation and cleaner product messaging.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "operations",
          workflowName: "Retailer launch briefing assistant",
          summary: "Summarize product and channel updates for retailer-facing launch teams.",
          painPoint: "Launch teams reconstruct the same product and brand context for each retailer.",
          whyNow: "Brand and parent pages both show Sparkle Water as a retail beverage line.",
          expectedOutcome: "Faster retailer brief creation and fewer manual handoffs.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "customer_support",
          workflowName: "Consumer product FAQ assistant",
          summary: "Help support teams answer shopper questions about flavors, ingredients, and availability.",
          painPoint: "Consumer teams need grounded answers on product details from a thin public site.",
          whyNow: "The brand relationship and product description are explicit in public sources.",
          expectedOutcome: "Clearer consumer support with less manual lookup work.",
          evidenceSourceIds: [1, 2],
        },
      ],
      "Sparkle Water should begin with a workspace-led motion because the public record supports retail knowledge workflows without requiring deep system integrations first.",
      [1, 2],
    ),
  },
  {
    label: "regulated company",
    inputUrl: "https://harborbank.example/",
    factPacket: createFactPacket({
      canonicalDomain: "harborbank.example",
      companyName: "Harbor Bank",
      archetype: "regulated company",
      industry: "Financial services",
      businessModel: "Retail and commercial banking",
      offerings: "Harbor Bank provides consumer banking, lending, and treasury services.",
      targetCustomers: "Consumers, small businesses, and commercial banking clients",
      companyDescription: "Harbor Bank is a regulated financial institution serving retail and commercial banking customers.",
      sources: [
        {
          id: 1,
          title: "Harbor Bank | Banking and lending",
          url: "https://harborbank.example/",
          sourceType: "company_homepage",
          summary: "Harbor Bank provides checking, lending, and treasury services to consumers and businesses.",
        },
        {
          id: 2,
          title: "Harbor Bank security and privacy",
          url: "https://harborbank.example/security",
          sourceType: "security_page",
          summary: "Harbor Bank emphasizes fraud prevention, privacy, and secure banking operations.",
        },
      ],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "customer_support",
          workflowName: "Banking support knowledge assistant",
          summary: "Help service teams answer grounded questions on products, policies, and account workflows.",
          painPoint: "Banking support agents search policy and product documentation under tight compliance constraints.",
          whyNow: "Harbor Bank publicly emphasizes security, privacy, and service breadth.",
          expectedOutcome: "Faster support handling with more consistent policy answers.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "operations",
          workflowName: "Fraud operations summary assistant",
          summary: "Summarize case notes and policy guidance for fraud and operations teams.",
          painPoint: "Fraud teams spend time reconciling notes and policy guidance across cases.",
          whyNow: "Security and fraud prevention are visible public priorities for Harbor Bank.",
          expectedOutcome: "Cleaner case preparation and quicker analyst review.",
          evidenceSourceIds: [1, 2],
          recommendedMotion: "hybrid",
        },
        {
          department: "legal",
          workflowName: "Policy change briefing assistant",
          summary: "Summarize product and policy updates for banking and compliance stakeholders.",
          painPoint: "Teams repeat the same policy translation work across service and operations groups.",
          whyNow: "Regulated banking products require disciplined policy communication.",
          expectedOutcome: "Faster policy rollouts with clearer stakeholder alignment.",
          evidenceSourceIds: [1, 2],
        },
      ],
      "Harbor Bank should start with a hybrid motion because regulated service and operations workflows need grounded knowledge plus controls around downstream actions.",
      [1, 2],
    ),
  },
  {
    label: "marketplace or ecommerce",
    inputUrl: "https://marketlane.example/merchants",
    factPacket: createFactPacket({
      canonicalDomain: "marketlane.example",
      companyName: "MarketLane",
      archetype: "marketplace or ecommerce",
      industry: "Marketplace commerce",
      businessModel: "Two-sided marketplace",
      offerings: "MarketLane connects merchants and shoppers through an ecommerce marketplace.",
      targetCustomers: "Marketplace merchants and online shoppers",
      companyDescription: "MarketLane operates an ecommerce marketplace for merchants and shoppers.",
      sources: [
        {
          id: 1,
          title: "MarketLane marketplace",
          url: "https://marketlane.example/",
          sourceType: "company_homepage",
          summary: "MarketLane connects merchants and shoppers across its ecommerce marketplace.",
        },
        {
          id: 2,
          title: "Sell on MarketLane",
          url: "https://marketlane.example/merchants",
          sourceType: "solutions_page",
          summary: "MarketLane highlights merchant onboarding, catalog quality, and shopper trust.",
        },
      ],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "operations",
          workflowName: "Merchant onboarding assistant",
          summary: "Help merchant teams answer setup, catalog, and policy questions during onboarding.",
          painPoint: "Marketplace onboarding teams repeat the same setup guidance for new merchants.",
          whyNow: "MarketLane publicly emphasizes merchant onboarding and marketplace quality.",
          expectedOutcome: "Faster merchant activation and fewer onboarding escalations.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "customer_support",
          workflowName: "Returns support assistant",
          summary: "Support shopper and merchant teams with grounded responses on returns and policy workflows.",
          painPoint: "Marketplace support teams reconcile policies across merchants and shoppers.",
          whyNow: "Trust and policy consistency are core marketplace issues.",
          expectedOutcome: "Faster support resolution and more consistent policy responses.",
          evidenceSourceIds: [1, 2],
        },
        {
          department: "operations",
          workflowName: "Catalog quality review assistant",
          summary: "Summarize listing issues and merchant guidance for marketplace catalog teams.",
          painPoint: "Catalog reviewers spend time interpreting repetitive listing and merchant quality issues.",
          whyNow: "Merchant onboarding and catalog quality are visible parts of the business model.",
          expectedOutcome: "Cleaner listings and fewer manual review cycles.",
          evidenceSourceIds: [1, 2],
        },
      ],
      "MarketLane can begin with a workspace-led rollout because merchant onboarding and support knowledge are visible, repeatable marketplace workflows.",
      [1, 2],
    ),
  },
] as const;

const failureFixtures: Array<{
  label: string;
  inputUrl: string;
  factPacket: FactPacket;
  accountPlan: FinalAccountPlan;
  expectedRecommendation: "publish_full" | "publish_grounded_fallback" | "reject";
  expectedFailedKeys: ReportQualityInvariantKey[];
}> = [
  {
    label: "acronym ambiguity rejects raw domain-style names",
    inputUrl: "https://burgerkingdom.example/",
    factPacket: createFactPacket({
      canonicalDomain: "burgerkingdom.example",
      companyName: "BK",
      archetype: "franchise or restaurant brand",
      industry: "Quick-service restaurants",
      businessModel: "Restaurant brand",
      offerings: "Burger Kingdom sells quick-service restaurant meals.",
      targetCustomers: "Restaurant guests",
      companyDescription: "Burger Kingdom operates quick-service restaurants for guests and franchisees.",
      sources: [
        {
          id: 1,
          title: "Burger Kingdom | Flame-grilled restaurants",
          url: "https://burgerkingdom.example/",
          sourceType: "company_homepage",
          summary: "Burger Kingdom serves restaurant guests through a global quick-service brand.",
        },
      ],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "operations",
          workflowName: "Restaurant operations assistant",
          summary: "Help restaurant teams answer menu and launch questions.",
          painPoint: "Restaurant teams search many systems for menu details.",
          whyNow: "The brand publicly highlights menu offers and restaurant operations.",
          expectedOutcome: "Faster restaurant execution.",
          evidenceSourceIds: [1],
        },
        {
          department: "customer_support",
          workflowName: "Guest support assistant",
          summary: "Draft grounded answers for guest order questions.",
          painPoint: "Guest teams repeat the same restaurant policy answers.",
          whyNow: "Guest service is central to a restaurant brand.",
          expectedOutcome: "Faster guest support.",
          evidenceSourceIds: [1],
        },
        {
          department: "marketing",
          workflowName: "Menu launch assistant",
          summary: "Support restaurant launch teams with product FAQs.",
          painPoint: "Teams recreate menu launch content for each promotion.",
          whyNow: "Restaurant launches happen frequently.",
          expectedOutcome: "Faster menu launches.",
          evidenceSourceIds: [1],
        },
      ],
      "A workspace-first motion fits the restaurant brand's menu and support workflows.",
      [1],
    ),
    expectedRecommendation: "reject",
    expectedFailedKeys: ["display_name_supported_by_evidence", "fallback_used_when_grounding_is_weak"],
  },
  {
    label: "parent-company ambiguity rejects unsupported identity swaps",
    inputUrl: "https://sparklewater.example/",
    factPacket: createFactPacket({
      canonicalDomain: "sparklewater.example",
      companyName: "Northstar Beverages",
      archetype: "thin brand site with parent-company context",
      industry: "Packaged beverages",
      businessModel: "Consumer packaged goods brand",
      offerings: "Sparkle Water sells flavored sparkling water through retail channels.",
      targetCustomers: "Retail shoppers",
      companyDescription: "Sparkle Water is a flavored sparkling water brand sold through retail channels.",
      sources: [
        {
          id: 1,
          title: "Northstar Beverages brands",
          url: "https://northstarbeverages.example/investors/brands",
          sourceType: "investor_relations_page",
          summary: "Northstar Beverages lists Sparkle Water as one of its retail brands.",
          sourceTier: "secondary",
        },
      ],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "marketing",
          workflowName: "Retail campaign assistant",
          summary: "Support retail launches for beverage products.",
          painPoint: "Teams repeat campaign preparation work across retailers.",
          whyNow: "Retail beverage launches require repeated coordination.",
          expectedOutcome: "Faster retail launches.",
          evidenceSourceIds: [1],
        },
        {
          department: "operations",
          workflowName: "Retailer briefing assistant",
          summary: "Prepare product briefings for retail buyers.",
          painPoint: "Product details are hard to collect across launches.",
          whyNow: "Retail buyers need current product context.",
          expectedOutcome: "Faster buyer communication.",
          evidenceSourceIds: [1],
        },
        {
          department: "customer_support",
          workflowName: "Consumer product FAQ assistant",
          summary: "Help support teams answer flavor and ingredient questions.",
          painPoint: "Support teams repeat product detail lookups.",
          whyNow: "Consumer product questions are frequent.",
          expectedOutcome: "Faster consumer answers.",
          evidenceSourceIds: [1],
        },
      ],
      "A workspace-first motion fits repeated beverage launch and support content workflows.",
      [1],
    ),
    expectedRecommendation: "reject",
    expectedFailedKeys: ["entity_resolution_plausible_for_domain", "fallback_used_when_grounding_is_weak"],
  },
  {
    label: "transient outage contamination falls back instead of publishing nonsense",
    inputUrl: "https://cloudsuite.example/status",
    factPacket: createFactPacket({
      canonicalDomain: "cloudsuite.example",
      companyName: "CloudSuite",
      archetype: "B2B SaaS",
      industry: "Enterprise software",
      businessModel: "Subscription B2B SaaS platform",
      offerings: "CloudSuite sells workflow automation software.",
      targetCustomers: "Enterprise operations teams",
      companyDescription: "CloudSuite sells workflow automation software to enterprises.",
      sources: [
        {
          id: 1,
          title: "CloudSuite status",
          url: "https://status.cloudsuite.example/",
          sourceType: "status_page",
          summary: "CloudSuite experienced temporary maintenance and service unavailable errors.",
        },
        {
          id: 2,
          title: "Incident: service unavailable",
          url: "https://status.cloudsuite.example/incidents/123",
          sourceType: "incident_page",
          summary: "Scheduled maintenance caused gateway timeout and outage updates.",
        },
      ],
      keyPublicSignals: [{ summary: "Status incidents are not stable product evidence.", sourceIds: [1, 2] }],
    }),
    accountPlan: createFullAccountPlan(
      [
        {
          department: "operations",
          workflowName: "Outage command center assistant",
          summary: "Summarize maintenance events and service unavailable notices for customers.",
          painPoint: "Teams need faster summaries during outage response.",
          whyNow: "Recent maintenance and gateway timeout incidents dominate the public record.",
          expectedOutcome: "Faster incident summaries.",
          evidenceSourceIds: [1, 2],
          recommendedMotion: "hybrid",
          motionRationale: "The outage workflow needs connections into incident systems.",
          evidenceConfidence: 74,
        },
        {
          department: "customer_support",
          workflowName: "Maintenance notice drafter",
          summary: "Draft customer notices from outage and status updates.",
          painPoint: "Support teams repeat maintenance explanations.",
          whyNow: "Status incidents dominate the current evidence.",
          expectedOutcome: "Faster status communications.",
          evidenceSourceIds: [1, 2],
          evidenceConfidence: 72,
        },
        {
          department: "operations",
          workflowName: "Incident recap generator",
          summary: "Turn outage notes into internal recaps.",
          painPoint: "Operations teams manually summarize temporary incidents.",
          whyNow: "The site currently shows maintenance and downtime events.",
          expectedOutcome: "Faster recap writing.",
          evidenceSourceIds: [1, 2],
          evidenceConfidence: 71,
        },
      ],
      "A hybrid motion fits because the company needs better maintenance and outage coordination.",
      [1, 2],
    ),
    expectedRecommendation: "publish_grounded_fallback",
    expectedFailedKeys: [
      "top_opportunities_target_company",
      "recommendations_grounded_in_evidence",
      "transient_operational_pages_not_dominant",
      "fallback_used_when_grounding_is_weak",
    ],
  },
  {
    label: "self-referential seller-tooling drift falls back",
    inputUrl: "https://quickbite.example/",
    factPacket: archetypeFixtures[1].factPacket,
    accountPlan: createFullAccountPlan(
      [
        {
          department: "sales",
          workflowName: "Account intelligence copilot",
          summary: "Prepare sellers with account intelligence before discovery calls.",
          painPoint: "Sellers lack discovery-ready account context.",
          whyNow: "The business needs better seller workflow tooling.",
          expectedOutcome: "Faster seller preparation.",
          evidenceSourceIds: [1, 2],
          motionRationale: "Seller tooling can start in a workspace with minimal integration.",
          evidenceConfidence: 76,
        },
        {
          department: "sales",
          workflowName: "Discovery brief builder",
          summary: "Generate discovery briefs for account planning and prospect research.",
          painPoint: "Sellers manually build account plans.",
          whyNow: "Discovery workflows are repetitive.",
          expectedOutcome: "Faster account planning.",
          evidenceSourceIds: [1, 2],
          evidenceConfidence: 75,
        },
        {
          department: "sales",
          workflowName: "Research prioritization copilot",
          summary: "Help seller teams prioritize target accounts and research coverage.",
          painPoint: "Seller teams cannot prioritize account research.",
          whyNow: "Research prioritization is still manual.",
          expectedOutcome: "Better seller focus.",
          evidenceSourceIds: [1, 2],
          evidenceConfidence: 74,
        },
      ],
      "QuickBite should prioritize seller workflow tooling and account planning acceleration.",
      [1, 2],
    ),
    expectedRecommendation: "publish_grounded_fallback",
    expectedFailedKeys: ["top_opportunities_target_company", "fallback_used_when_grounding_is_weak"],
  },
  {
    label: "thin evidence publishes a grounded fallback instead of a polished full plan",
    inputUrl: "https://northshoreclinic.example/",
    factPacket: createFactPacket({
      canonicalDomain: "northshoreclinic.example",
      companyName: "Northshore Clinic",
      archetype: "regulated company",
      industry: "Healthcare services",
      businessModel: "Regional healthcare provider",
      offerings: "Northshore Clinic provides outpatient care and patient services.",
      targetCustomers: "Patients and care teams",
      companyDescription: "Northshore Clinic is a regional healthcare provider with thin public operating detail.",
      sources: [
        {
          id: 1,
          title: "Northshore Clinic",
          url: "https://northshoreclinic.example/",
          sourceType: "company_homepage",
          summary: "Northshore Clinic provides outpatient care services.",
        },
      ],
      overallConfidence: "low",
      confidence: 66,
    }),
    accountPlan: createGroundedFallbackPlan(
      "Northshore Clinic is a regional healthcare provider with thin public detail. Company-specific opportunity fit stayed low-confidence, so this brief remains focused on identity and the available public snapshot.",
      [1],
    ),
    expectedRecommendation: "publish_grounded_fallback",
    expectedFailedKeys: [],
  },
  {
    label: "deep subpage inputs still resolve to a grounded full report",
    inputUrl: "https://cloudsuite.example/platform/workflows/agent-studio?utm_source=demo#overview",
    factPacket: archetypeFixtures[3].factPacket,
    accountPlan: archetypeFixtures[3].accountPlan,
    expectedRecommendation: "publish_full",
    expectedFailedKeys: [],
  },
  {
    label: "localized site inputs still stay company-specific",
    inputUrl: "https://fr.marketlane.example/fr/merchants?utm_campaign=demo#faq",
    factPacket: archetypeFixtures[7].factPacket,
    accountPlan: archetypeFixtures[7].accountPlan,
    expectedRecommendation: "publish_full",
    expectedFailedKeys: [],
  },
];

const inputShapeFixtures = [
  {
    label: "root domain",
    inputUrl: "https://marketlane.example/",
    expectedNormalizedUrl: "https://marketlane.example/",
    expectedCanonicalDomain: "marketlane.example",
    sourcePlanCanonicalDomain: "marketlane.example",
    expectedTopUrls: ["https://marketlane.example/"],
  },
  {
    label: "deep product page",
    inputUrl: "https://cloudsuite.example/platform/workflows/agent-studio?utm_source=demo#overview",
    expectedNormalizedUrl: "https://cloudsuite.example/platform/workflows/agent-studio",
    expectedCanonicalDomain: "cloudsuite.example",
    sourcePlanCanonicalDomain: "cloudsuite.example",
    expectedTopUrls: ["https://cloudsuite.example/", "https://cloudsuite.example/platform/workflows/agent-studio"],
  },
  {
    label: "careers page",
    inputUrl: "https://motorworks.example/careers/ai-platform?utm_source=demo",
    expectedNormalizedUrl: "https://motorworks.example/careers/ai-platform",
    expectedCanonicalDomain: "motorworks.example",
    sourcePlanCanonicalDomain: "motorworks.example",
    expectedTopUrls: ["https://motorworks.example/", "https://motorworks.example/careers/ai-platform"],
  },
  {
    label: "investor page",
    inputUrl: "https://motorworks.example/investors/q1-letter#financials",
    expectedNormalizedUrl: "https://motorworks.example/investors/q1-letter",
    expectedCanonicalDomain: "motorworks.example",
    sourcePlanCanonicalDomain: "motorworks.example",
    expectedTopUrls: ["https://motorworks.example/", "https://motorworks.example/investors/q1-letter"],
  },
  {
    label: "docs page",
    inputUrl: "https://docsforge.example/docs/sdk/start?utm_medium=email",
    expectedNormalizedUrl: "https://docsforge.example/docs/sdk/start",
    expectedCanonicalDomain: "docsforge.example",
    sourcePlanCanonicalDomain: "docsforge.example",
    expectedTopUrls: ["https://docsforge.example/", "https://docsforge.example/docs/sdk/start"],
  },
  {
    label: "localized subdomain",
    inputUrl: "https://fr.marketlane.example/fr/merchants?utm_campaign=demo#faq",
    expectedNormalizedUrl: "https://fr.marketlane.example/fr/merchants",
    expectedCanonicalDomain: "fr.marketlane.example",
    sourcePlanCanonicalDomain: "marketlane.example",
    expectedTopUrls: ["https://fr.marketlane.example/", "https://fr.marketlane.example/fr/merchants"],
  },
  {
    label: "redirect and canonicalization",
    inputUrl: "http://www.docsforge.example/platform?utm_source=ads#start",
    expectedNormalizedUrl: "http://www.docsforge.example/platform",
    expectedCanonicalDomain: "docsforge.example",
    sourcePlanCanonicalDomain: "docsforge.example",
    expectedTopUrls: ["http://www.docsforge.example/", "http://www.docsforge.example/platform"],
  },
] as const;

describe("Archetypes", () => {
  it.each(archetypeFixtures)("$label stays publishable under domain-agnostic invariants", ({ inputUrl, factPacket, accountPlan }) => {
    const evaluation = evaluateReportQualityInvariants({
      canonicalDomain: extractCanonicalDomain(inputUrl),
      factPacket,
      accountPlan,
    });

    expect(evaluation.recommendation).toBe("publish_full");
    expect(evaluation.failedInvariantKeys).toEqual([]);
    expect(evaluation.scorecard.every((entry) => entry.status === "pass")).toBe(true);
  });
});

describe("Failure Classes", () => {
  it.each(failureFixtures)("$label", ({ inputUrl, factPacket, accountPlan, expectedRecommendation, expectedFailedKeys }) => {
    const evaluation = evaluateReportQualityInvariants({
      canonicalDomain: extractCanonicalDomain(inputUrl),
      factPacket,
      accountPlan,
    });

    expect(evaluation.recommendation).toBe(expectedRecommendation);
    expect(evaluation.failedInvariantKeys).toEqual(expect.arrayContaining(expectedFailedKeys));
  });
});

describe("Input Shapes", () => {
  it.each(inputShapeFixtures)(
    "$label keeps arbitrary entry URLs normalized and close to the deterministic source plan",
    ({ inputUrl, expectedNormalizedUrl, expectedCanonicalDomain, sourcePlanCanonicalDomain, expectedTopUrls }) => {
      const normalized = safeNormalizeCompanyUrl(inputUrl);

      expect(normalized).toEqual({
        success: true,
        data: expectedNormalizedUrl,
      });
      expect(extractCanonicalDomain(inputUrl)).toBe(expectedCanonicalDomain);

      const candidates = buildInitialCrawlCandidates(expectedNormalizedUrl, sourcePlanCanonicalDomain);
      const urls = candidates.map((candidate) => candidate.url);

      expect(urls.slice(0, expectedTopUrls.length)).toEqual(expectedTopUrls);
    },
  );
});
