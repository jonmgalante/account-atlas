import "server-only";

import { and, isNotNull, lt } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { artifacts, reportRuns } from "@/server/db/schema";

export async function listRunsWithExpiredVectorStores(olderThanDays = 7) {
  const db = getDb();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1_000);

  return db
    .select({
      runId: reportRuns.id,
      reportId: reportRuns.reportId,
      vectorStoreId: reportRuns.vectorStoreId,
      completedAt: reportRuns.completedAt,
    })
    .from(reportRuns)
    .where(and(isNotNull(reportRuns.vectorStoreId), lt(reportRuns.updatedAt, cutoff)));
}

export async function listArtifactsEligibleForRetentionReview(olderThanDays = 14) {
  const db = getDb();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1_000);

  return db
    .select({
      artifactId: artifacts.id,
      reportId: artifacts.reportId,
      runId: artifacts.runId,
      artifactType: artifacts.artifactType,
      storagePointers: artifacts.storagePointers,
      updatedAt: artifacts.updatedAt,
    })
    .from(artifacts)
    .where(lt(artifacts.updatedAt, cutoff));
}

// TODO: Wire these helpers into a scheduled maintenance job once deletion flows
// for OpenAI vector stores and Blob-backed artifacts are approved for production.
