import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

const protectedEnvKeys = new Set(Object.keys(process.env));

function loadEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return false;
  }

  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = normalizedLine.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();

    if (!key || protectedEnvKeys.has(key)) {
      continue;
    }

    let value = normalizedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }

  return true;
}

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

function exitWithJson(statusCode, payload) {
  if (statusCode === 0) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(JSON.stringify(payload, null, 2));
  }

  process.exit(statusCode);
}

function pickLastErrorEvent(events) {
  const prioritizedEventTypes = [
    "run_failed",
    "pipeline.run.failed",
    "step_failed",
    "pipeline.step.failed",
    "crawl.html_seed_exhausted",
    "crawl.source.skipped",
    "crawl.pdf.skipped",
  ];

  for (const eventType of prioritizedEventTypes) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];

      if (event.event_type === eventType) {
        return event;
      }
    }
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.level === "error") {
      return event;
    }
  }

  return null;
}

function buildStepSummary(pipelineState) {
  const steps = pipelineState?.steps ?? {};
  const completedSteps = [];
  let failingStep = null;

  for (const [stepKey, state] of Object.entries(steps)) {
    if (state?.status === "completed") {
      completedSteps.push(stepKey);
      continue;
    }

    if (!failingStep && (state?.status === "failed" || state?.status === "retrying")) {
      failingStep = {
        key: stepKey,
        status: state.status,
        attemptCount: state.attemptCount ?? 0,
        errorCode: state.errorCode ?? null,
        errorMessage: state.errorMessage ?? null,
      };
    }
  }

  return {
    completedSteps,
    failingStep,
  };
}

function buildRetrySummary(run, events) {
  const observedDeliveryCounts = [
    ...new Set(
      events
        .map((event) => event.metadata?.deliveryCount)
        .filter((value) => typeof value === "number"),
    ),
  ].sort((left, right) => left - right);

  const retryEvents = events.filter((event) => ["retrying", "pipeline.step.retry_scheduled"].includes(event.event_type));
  const retryingStep = Object.entries(run.pipeline_state?.steps ?? {}).find(([, state]) => state?.status === "retrying");

  return {
    retryingNow: Boolean(retryingStep),
    retryingStep: retryingStep
      ? {
          key: retryingStep[0],
          attemptCount: retryingStep[1]?.attemptCount ?? 0,
        }
      : null,
    observedRetryCount: retryEvents.length,
    observedDeliveryCounts,
  };
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const target = process.argv[2]?.trim();

if (!target) {
  exitWithJson(1, {
    status: "error",
    message: "Usage: pnpm run:inspect <shareId|runId>",
  });
}

if (!process.env.DATABASE_URL) {
  exitWithJson(1, {
    status: "error",
    message: "DATABASE_URL is not set in the shell or env files.",
  });
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
});

try {
  const numericRunId = /^\d+$/.test(target) ? Number(target) : null;

  const rows =
    numericRunId !== null
      ? await sql`
          select
            r.id as report_id,
            r.share_id,
            r.status as report_status,
            rr.id as run_id,
            rr.status as run_status,
            rr.execution_mode,
            rr.progress_percent,
            rr.step_key,
            rr.status_message,
            rr.error_code,
            rr.error_message,
            rr.queue_message_id,
            rr.pipeline_state,
            rr.started_at,
            rr.updated_at,
            rr.completed_at,
            rr.failed_at
          from report_runs rr
          inner join reports r on r.id = rr.report_id
          where rr.id = ${numericRunId}
          limit 1
        `
      : await sql`
          select
            r.id as report_id,
            r.share_id,
            r.status as report_status,
            rr.id as run_id,
            rr.status as run_status,
            rr.execution_mode,
            rr.progress_percent,
            rr.step_key,
            rr.status_message,
            rr.error_code,
            rr.error_message,
            rr.queue_message_id,
            rr.pipeline_state,
            rr.started_at,
            rr.updated_at,
            rr.completed_at,
            rr.failed_at
          from reports r
          inner join report_runs rr on rr.report_id = r.id
          where r.share_id = ${target}
          order by rr.id desc
          limit 1
        `;

  const run = rows[0];

  if (!run) {
    exitWithJson(1, {
      status: "error",
      message: `No report run found for ${target}.`,
    });
  }

  const events = await sql`
    select
      id,
      level,
      event_type,
      step_key,
      message,
      metadata,
      occurred_at
    from report_events
    where run_id = ${run.run_id}
    order by id asc
  `;

  const { completedSteps, failingStep } = buildStepSummary(run.pipeline_state);
  const lastErrorEvent = pickLastErrorEvent(events);
  const retrySummary = buildRetrySummary(run, events);

  exitWithJson(0, {
    status: "ok",
    target: {
      input: target,
      resolvedRunId: Number(run.run_id),
      shareId: run.share_id,
    },
    run: {
      reportStatus: run.report_status,
      runStatus: run.run_status,
      executionMode: run.execution_mode,
      progressPercent: run.progress_percent,
      stepKey: run.step_key,
      statusMessage: run.status_message,
      errorCode: run.error_code,
      errorMessage: run.error_message,
      queueMessageId: run.queue_message_id,
      startedAt: normalizeTimestamp(run.started_at),
      updatedAt: normalizeTimestamp(run.updated_at),
      completedAt: normalizeTimestamp(run.completed_at),
      failedAt: normalizeTimestamp(run.failed_at),
    },
    steps: {
      completedSteps,
      failingStep,
    },
    lastErrorSummary: lastErrorEvent
      ? {
          eventType: lastErrorEvent.event_type,
          stepKey: lastErrorEvent.step_key,
          message: lastErrorEvent.message,
          errorCode: lastErrorEvent.metadata?.errorCode ?? null,
          errorMessage: lastErrorEvent.metadata?.errorMessage ?? null,
          errorCause: lastErrorEvent.metadata?.errorCause ?? null,
          occurredAt: normalizeTimestamp(lastErrorEvent.occurred_at),
        }
      : null,
    retries: retrySummary,
    recentEvents: events.slice(-12).map((event) => ({
      id: event.id,
      level: event.level,
      eventType: event.event_type,
      stepKey: event.step_key,
      message: event.message,
      metadata: event.metadata ?? {},
      occurredAt: normalizeTimestamp(event.occurred_at),
    })),
  });
} catch (error) {
  exitWithJson(1, {
    status: "error",
    message: error instanceof Error ? error.message : "Unable to inspect the report run.",
  });
} finally {
  await sql.end({ timeout: 5 });
}
