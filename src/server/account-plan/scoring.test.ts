import { describe, expect, it } from "vitest";

import { calculatePriorityScore, normalizeUseCaseScorecard, rankAccountPlanUseCases } from "@/server/account-plan/scoring";

describe("account-plan scoring", () => {
  it("applies the locked priority formula", () => {
    const priorityScore = calculatePriorityScore({
      businessValue: 90,
      deploymentReadiness: 80,
      expansionPotential: 70,
      openaiFit: 85,
      sponsorLikelihood: 75,
      evidenceConfidence: 65,
      riskPenalty: 20,
    });

    expect(priorityScore).toBe(77.25);
  });

  it("normalizes component scores and ranks use cases by priority", () => {
    const ranked = rankAccountPlanUseCases([
      {
        priorityRank: 0,
        department: "sales",
        workflowName: "Deal desk copilot",
        summary: "Summarize account context and pricing guardrails.",
        painPoint: "Rep ramp and quote cycle time are slow.",
        whyNow: "Commercial pressure is rising.",
        likelyUsers: ["Sales reps"],
        expectedOutcome: "Faster quote cycles.",
        metrics: ["Time to draft quote"],
        dependencies: ["CRM hygiene"],
        securityComplianceNotes: [],
        recommendedMotion: "workspace",
        motionRationale: "Knowledge-heavy workflow.",
        evidenceSourceIds: [1],
        openQuestions: ["How standardized is quote approval?"],
        scorecard: normalizeUseCaseScorecard({
          businessValue: 95,
          deploymentReadiness: 80,
          expansionPotential: 88,
          openaiFit: 92,
          sponsorLikelihood: 84,
          evidenceConfidence: 86,
          riskPenalty: 10,
        }),
      },
      {
        priorityRank: 0,
        department: "finance",
        workflowName: "Collections triage",
        summary: "Prioritize overdue accounts.",
        painPoint: "Collections work is fragmented.",
        whyNow: "Cash discipline matters.",
        likelyUsers: ["AR managers"],
        expectedOutcome: "Faster collections.",
        metrics: ["Days sales outstanding"],
        dependencies: ["ERP access"],
        securityComplianceNotes: ["Review customer-financial access controls."],
        recommendedMotion: "hybrid",
        motionRationale: "Requires system integration.",
        evidenceSourceIds: [1],
        openQuestions: ["Where does dispute history live?"],
        scorecard: normalizeUseCaseScorecard({
          businessValue: 70,
          deploymentReadiness: 65,
          expansionPotential: 60,
          openaiFit: 72,
          sponsorLikelihood: 68,
          evidenceConfidence: 62,
          riskPenalty: 18,
        }),
      },
    ]);

    expect(ranked[0]?.workflowName).toBe("Deal desk copilot");
    expect(ranked[0]?.priorityRank).toBe(1);
    expect(ranked[1]?.priorityRank).toBe(2);
    expect(ranked[0]?.scorecard.priorityScore).toBeGreaterThan(ranked[1]?.scorecard.priorityScore ?? 0);
  });
});
