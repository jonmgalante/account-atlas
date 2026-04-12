import "server-only";

import { buildFactPacket, parseFactPacketArtifact } from "@/server/research/fact-packet";
import { drizzleReportRepository } from "@/server/repositories/report-repository";
import { createReportService } from "@/server/services/report-service";
import { evaluateReportQualityInvariants } from "@/server/quality/report-quality";

type LiveCanaryOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
};

export type LiveCanaryResult = {
  inputUrl: string;
  shareId: string;
  companyName: string;
  reportStatus: string;
  publishMode: "full" | "grounded_fallback" | "insufficient";
  recommendation: ReturnType<typeof evaluateReportQualityInvariants>["recommendation"];
  failedInvariantKeys: ReturnType<typeof evaluateReportQualityInvariants>["failedInvariantKeys"];
  scorecard: ReturnType<typeof evaluateReportQualityInvariants>["scorecard"];
};

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runLiveQualityCanary(inputUrl: string, options: LiveCanaryOptions = {}): Promise<LiveCanaryResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const service = createReportService({
    repository: drizzleReportRepository,
  });
  const created = await service.createReport(inputUrl, {
    requesterHash: `quality-canary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  const deadline = Date.now() + timeoutMs;
  let status = await service.getReportStatusShell(created.shareId);

  while ((!status?.isTerminal || !status.currentRun) && Date.now() < deadline) {
    await wait(pollIntervalMs);
    status = await service.getReportStatusShell(created.shareId);
  }

  if (!status?.currentRun) {
    throw new Error(`Could not load report status for ${inputUrl}.`);
  }

  if (!status.isTerminal) {
    throw new Error(`Timed out waiting for ${inputUrl} to reach a terminal report state.`);
  }

  const shell = await drizzleReportRepository.findReportShellByShareId(created.shareId);

  if (!shell?.currentRun?.accountPlan) {
    throw new Error(`No account plan was persisted for live canary ${inputUrl}.`);
  }

  const artifacts = await drizzleReportRepository.listArtifactsByRunId(shell.currentRun.id);
  let factPacket = parseFactPacketArtifact(artifacts);

  if (!factPacket) {
    const [sources, facts] = await Promise.all([
      drizzleReportRepository.listSourcesByRunId(shell.currentRun.id),
      drizzleReportRepository.listFactsByRunId(shell.currentRun.id),
    ]);

    if (!sources.length || !facts.length) {
      throw new Error(`No fact packet or enough persisted evidence was available for ${inputUrl}.`);
    }

    factPacket = buildFactPacket({
      context: {
        report: shell.report,
        run: shell.currentRun,
      },
      sources,
      facts,
    });
  }

  const evaluation = evaluateReportQualityInvariants({
    canonicalDomain: shell.report.canonicalDomain,
    factPacket,
    accountPlan: shell.currentRun.accountPlan,
  });

  return {
    inputUrl,
    shareId: shell.report.shareId,
    companyName:
      shell.currentRun.researchSummary?.companyIdentity.companyName ??
      shell.report.companyName ??
      shell.report.canonicalDomain,
    reportStatus: shell.report.status,
    publishMode:
      shell.currentRun.accountPlan.publishMode === "grounded_fallback"
        ? "grounded_fallback"
        : evaluation.shouldPublishFull
          ? "full"
          : "insufficient",
    recommendation: evaluation.recommendation,
    failedInvariantKeys: evaluation.failedInvariantKeys,
    scorecard: evaluation.scorecard,
  };
}
