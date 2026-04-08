import "server-only";

import type { AccountPlanUseCase, UseCaseScorecard } from "@/lib/types/account-plan";

type UseCaseScorecardInput = Omit<UseCaseScorecard, "priorityScore">;

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export function calculatePriorityScore(scorecard: UseCaseScorecardInput) {
  const priorityScore =
    0.25 * scorecard.businessValue +
    0.2 * scorecard.deploymentReadiness +
    0.2 * scorecard.expansionPotential +
    0.15 * scorecard.openaiFit +
    0.1 * scorecard.sponsorLikelihood +
    0.1 * scorecard.evidenceConfidence -
    0.1 * scorecard.riskPenalty;

  return Number(priorityScore.toFixed(2));
}

export function normalizeUseCaseScorecard(scorecard: UseCaseScorecardInput): UseCaseScorecard {
  const normalizedInput = {
    businessValue: clampScore(scorecard.businessValue),
    deploymentReadiness: clampScore(scorecard.deploymentReadiness),
    expansionPotential: clampScore(scorecard.expansionPotential),
    openaiFit: clampScore(scorecard.openaiFit),
    sponsorLikelihood: clampScore(scorecard.sponsorLikelihood),
    evidenceConfidence: clampScore(scorecard.evidenceConfidence),
    riskPenalty: clampScore(scorecard.riskPenalty),
  };

  return {
    ...normalizedInput,
    priorityScore: calculatePriorityScore(normalizedInput),
  };
}

export function rankAccountPlanUseCases(useCases: AccountPlanUseCase[]) {
  const ranked = [...useCases].sort((left, right) => {
    if (right.scorecard.priorityScore !== left.scorecard.priorityScore) {
      return right.scorecard.priorityScore - left.scorecard.priorityScore;
    }

    if (right.scorecard.evidenceConfidence !== left.scorecard.evidenceConfidence) {
      return right.scorecard.evidenceConfidence - left.scorecard.evidenceConfidence;
    }

    if (right.scorecard.businessValue !== left.scorecard.businessValue) {
      return right.scorecard.businessValue - left.scorecard.businessValue;
    }

    return left.workflowName.localeCompare(right.workflowName);
  });

  return ranked.map((useCase, index) => ({
    ...useCase,
    priorityRank: index + 1,
  }));
}
