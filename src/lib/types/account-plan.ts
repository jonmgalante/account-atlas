import type { MotionRecommendation } from "@/lib/types/report";

export const useCaseDepartmentValues = [
  "sales",
  "marketing",
  "customer_support",
  "success_services",
  "finance",
  "legal",
  "operations",
  "hr",
  "engineering",
  "product",
  "it_security",
  "analytics_data",
] as const;

export type UseCaseDepartment = (typeof useCaseDepartmentValues)[number];

export type UseCaseScorecard = {
  businessValue: number;
  deploymentReadiness: number;
  expansionPotential: number;
  openaiFit: number;
  sponsorLikelihood: number;
  evidenceConfidence: number;
  riskPenalty: number;
  priorityScore: number;
};

export type AccountPlanUseCase = {
  priorityRank: number;
  department: UseCaseDepartment;
  workflowName: string;
  summary: string;
  painPoint: string;
  whyNow: string;
  likelyUsers: string[];
  expectedOutcome: string;
  metrics: string[];
  dependencies: string[];
  securityComplianceNotes: string[];
  recommendedMotion: MotionRecommendation;
  motionRationale: string;
  evidenceSourceIds: number[];
  openQuestions: string[];
  scorecard: UseCaseScorecard;
};

export type StakeholderHypothesis = {
  likelyRole: string;
  department: string | null;
  hypothesis: string;
  rationale: string;
  confidence: number;
  evidenceSourceIds: number[];
};

export type ObjectionAndRebuttal = {
  objection: string;
  rebuttal: string;
  evidenceSourceIds: number[];
};

export type DiscoveryQuestion = {
  question: string;
  whyItMatters: string;
  evidenceSourceIds: number[];
};

export type PilotPlanPhase = {
  name: string;
  duration: string;
  goals: string[];
  deliverables: string[];
};

export type PilotPlan = {
  objective: string;
  recommendedMotion: MotionRecommendation;
  scope: string;
  successMetrics: string[];
  phases: PilotPlanPhase[];
  dependencies: string[];
  risks: string[];
  evidenceSourceIds: number[];
};

export type ExpansionScenario = {
  summary: string;
  assumptions: string[];
  expectedOutcomes: string[];
  evidenceSourceIds: number[];
};

export type AccountMotionRecommendation = {
  recommendedMotion: MotionRecommendation;
  rationale: string;
  evidenceSourceIds: number[];
};

export type FinalAccountPlan = {
  overallAccountMotion: AccountMotionRecommendation;
  candidateUseCases: AccountPlanUseCase[];
  topUseCases: AccountPlanUseCase[];
  stakeholderHypotheses: StakeholderHypothesis[];
  objectionsAndRebuttals: ObjectionAndRebuttal[];
  discoveryQuestions: DiscoveryQuestion[];
  pilotPlan: PilotPlan;
  expansionScenarios: {
    low: ExpansionScenario;
    base: ExpansionScenario;
    high: ExpansionScenario;
  };
};
