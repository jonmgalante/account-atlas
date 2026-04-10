import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const protectedEnvKeys = new Set(Object.keys(process.env));
const currentWorkingDirectory = process.cwd();
const isJsonOutput = process.argv.includes("--json");
const skipSmoke = process.argv.includes("--skip-smoke");

function loadEnvFile(fileName) {
  const filePath = path.resolve(currentWorkingDirectory, fileName);

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

function runCommand(command, args) {
  return spawnSync(command, args, {
    cwd: currentWorkingDirectory,
    encoding: "utf8",
    env: process.env,
  });
}

function looksLikePlaceholder(value) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("todo") ||
    normalized.includes("changeme") ||
    normalized.includes("your_") ||
    normalized.includes("replace_me")
  );
}

function parseIntegerEnv(key, options) {
  const rawValue = process.env[key];

  if (!rawValue || !rawValue.trim()) {
    return {
      ok: true,
      value: options.defaultValue,
      source: "default",
    };
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < options.min || value > options.max) {
    return {
      ok: false,
      value: rawValue,
      source: "env",
      reason: `${key} must be an integer between ${options.min} and ${options.max}.`,
    };
  }

  return {
    ok: true,
    value,
    source: "env",
  };
}

function addCheck(checks, input) {
  checks.push(input);
}

function summarizeChecks(checks) {
  return {
    errors: checks.filter((check) => check.status === "error").length,
    warnings: checks.filter((check) => check.status === "warning").length,
    ok: checks.filter((check) => check.status === "ok").length,
  };
}

const loadedFiles = [".env", ".env.local"].filter((fileName) => loadEnvFile(fileName));
const checks = [];

addCheck(checks, {
  key: "env_files",
  status: loadedFiles.length > 0 ? "ok" : "warning",
  summary:
    loadedFiles.length > 0
      ? `Loaded env values from ${loadedFiles.join(", ")}.`
      : "No .env or .env.local file was loaded; relying on shell env only.",
});

const requiredEnvChecks = [
  {
    key: "database_url",
    envKey: "DATABASE_URL",
    label: "Database URL",
  },
  {
    key: "openai_api_key",
    envKey: "OPENAI_API_KEY",
    label: "OpenAI API key",
  },
];

for (const requirement of requiredEnvChecks) {
  const value = process.env[requirement.envKey];

  if (!value) {
    addCheck(checks, {
      key: requirement.key,
      status: "error",
      summary: `${requirement.label} is missing.`,
    });
    continue;
  }

  if (looksLikePlaceholder(value)) {
    addCheck(checks, {
      key: requirement.key,
      status: "error",
      summary: `${requirement.label} still looks like a placeholder value.`,
    });
    continue;
  }

  addCheck(checks, {
    key: requirement.key,
    status: "ok",
    summary: `${requirement.label} is present.`,
  });
}

if (!process.env.REQUEST_FINGERPRINT_SALT) {
  addCheck(checks, {
    key: "request_fingerprint_salt",
    status: "warning",
    summary: "REQUEST_FINGERPRINT_SALT is missing. Local demos still work, but requester hashing will be unsalted.",
  });
} else if (looksLikePlaceholder(process.env.REQUEST_FINGERPRINT_SALT)) {
  addCheck(checks, {
    key: "request_fingerprint_salt",
    status: "warning",
    summary: "REQUEST_FINGERPRINT_SALT is present but still looks like a placeholder.",
  });
} else {
  addCheck(checks, {
    key: "request_fingerprint_salt",
    status: "ok",
    summary: "Requester fingerprint salt is configured.",
  });
}

const reportPipelineMode = process.env.REPORT_PIPELINE_MODE ?? "auto";

if (!["auto", "inline", "vercel_queue"].includes(reportPipelineMode)) {
  addCheck(checks, {
    key: "report_pipeline_mode",
    status: "error",
    summary: `REPORT_PIPELINE_MODE=${reportPipelineMode} is invalid.`,
  });
} else {
  addCheck(checks, {
    key: "report_pipeline_mode",
    status: "ok",
    summary: `REPORT_PIPELINE_MODE=${reportPipelineMode}.`,
  });
}

const crawlConfigChecks = [
  ["CRAWL_MAX_HTML_PAGES", { min: 1, max: 40, defaultValue: 12 }],
  ["CRAWL_MAX_PDF_LINKS", { min: 0, max: 20, defaultValue: 6 }],
  ["CRAWL_MAX_CONCURRENCY", { min: 1, max: 6, defaultValue: 2 }],
  ["CRAWL_REQUEST_TIMEOUT_MS", { min: 1_000, max: 60_000, defaultValue: 12_000 }],
  ["CRAWL_MAX_RESPONSE_BYTES", { min: 32_768, max: 5_000_000, defaultValue: 1_500_000 }],
  ["CRAWL_MAX_PDF_BYTES", { min: 32_768, max: 10_000_000, defaultValue: 4_000_000 }],
];

const invalidCrawlChecks = crawlConfigChecks
  .map(([key, options]) => parseIntegerEnv(key, options))
  .filter((result) => !result.ok);

if (invalidCrawlChecks.length > 0) {
  addCheck(checks, {
    key: "crawl_config",
    status: "error",
    summary: invalidCrawlChecks.map((result) => result.reason).join(" "),
  });
} else {
  addCheck(checks, {
    key: "crawl_config",
    status: "ok",
    summary: "Crawl budgets and timeouts are within supported ranges.",
  });
}

try {
  await import("@vercel/queue");

  const queueCallbackExists = existsSync(path.resolve(currentWorkingDirectory, "src/app/api/queues/report-runs/route.ts"));
  const internalQueueRouteExists = existsSync(
    path.resolve(currentWorkingDirectory, "src/app/api/internal/queue/report-runs/route.ts"),
  );

  if (reportPipelineMode === "inline") {
    addCheck(checks, {
      key: "queue_mode",
      status: "ok",
      summary: "Inline mode is configured; queue delivery is not required for local demos.",
    });
  } else if (reportPipelineMode === "auto" && process.env.VERCEL !== "1") {
    addCheck(checks, {
      key: "queue_mode",
      status: "ok",
      summary: "Auto mode will use the local inline fallback. Queue callback files are still present for deployed async runs.",
      details: {
        queueCallbackExists,
        internalQueueRouteExists,
      },
    });
  } else if (reportPipelineMode === "vercel_queue" && process.env.VERCEL !== "1") {
    addCheck(checks, {
      key: "queue_mode",
      status: "warning",
      summary: "Queue-only mode is configured outside Vercel. Local demos should switch to auto/inline or use the internal queue route explicitly.",
      details: {
        queueCallbackExists,
        internalQueueRouteExists,
      },
    });
  } else if (queueCallbackExists && internalQueueRouteExists) {
    addCheck(checks, {
      key: "queue_mode",
      status: "ok",
      summary: "Queue package and callback routes are present.",
    });
  } else {
    addCheck(checks, {
      key: "queue_mode",
      status: "error",
      summary: "Queue mode is enabled, but one or more callback routes are missing.",
      details: {
        queueCallbackExists,
        internalQueueRouteExists,
      },
    });
  }
} catch (error) {
  addCheck(checks, {
    key: "queue_mode",
    status: reportPipelineMode === "inline" ? "warning" : "error",
    summary: "The @vercel/queue package could not be loaded.",
    details: {
      error: error instanceof Error ? error.message : String(error),
    },
  });
}

try {
  await import("@react-pdf/renderer");

  addCheck(checks, {
    key: "export_readiness",
    status: "ok",
    summary: process.env.BLOB_READ_WRITE_TOKEN
      ? "PDF renderer is available and Blob-backed artifact storage is configured."
      : "PDF renderer is available. Blob storage is not configured, but inline artifact fallback remains available.",
  });
} catch (error) {
  addCheck(checks, {
    key: "export_readiness",
    status: "error",
    summary: "The PDF renderer dependency could not be loaded.",
    details: {
      error: error instanceof Error ? error.message : String(error),
    },
  });
}

const dbDoctor = runCommand(process.execPath, [path.resolve(currentWorkingDirectory, "scripts/db-doctor.mjs")]);

if (dbDoctor.status !== 0) {
  addCheck(checks, {
    key: "database_readiness",
    status: "error",
    summary: "Database readiness check failed.",
    details: {
      stdout: dbDoctor.stdout.trim() || null,
      stderr: dbDoctor.stderr.trim() || null,
    },
  });
} else {
  try {
    const dbDoctorResult = JSON.parse(dbDoctor.stdout);
    const databaseReady =
      dbDoctorResult?.readiness?.databaseConfigured &&
      dbDoctorResult?.readiness?.reportsTableReady &&
      dbDoctorResult?.readiness?.migrationsUpToDate;

    addCheck(checks, {
      key: "database_readiness",
      status: databaseReady ? "ok" : "error",
      summary: databaseReady
        ? `Database is reachable and migrations are up to date (${dbDoctorResult.database.currentDatabase}).`
        : "Database is reachable, but schema or migration readiness is incomplete.",
      details: {
        database: dbDoctorResult.database,
        migrations: dbDoctorResult.migrations,
      },
    });
  } catch (error) {
    addCheck(checks, {
      key: "database_readiness",
      status: "error",
      summary: "Database doctor output could not be parsed.",
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

addCheck(checks, {
  key: "research_pipeline",
  status: process.env.OPENAI_API_KEY ? "ok" : "error",
  summary: process.env.OPENAI_API_KEY
    ? "Research and synthesis steps have an OpenAI key available."
    : "Research and synthesis steps cannot produce a seller-facing brief without OPENAI_API_KEY.",
});

const smokeMatrix = [
  "src/server/pipeline/pipeline-runner.test.ts",
  "src/server/crawl/company-site-crawler.test.ts",
  "src/server/research/research-service.test.ts",
  "src/server/account-plan/account-plan-service.test.ts",
  "src/server/exports/export-service.test.ts",
  "src/server/services/report-service.test.ts",
];

if (skipSmoke) {
  addCheck(checks, {
    key: "failure_mode_matrix",
    status: "warning",
    summary: "Deterministic smoke matrix was skipped.",
  });
} else {
  const smokeResult = runCommand(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["report:smoke"]);

  addCheck(checks, {
    key: "failure_mode_matrix",
    status: smokeResult.status === 0 ? "ok" : "error",
    summary:
      smokeResult.status === 0
        ? "Deterministic smoke matrix passed for queue retry/resume, crawl fallback, partial-coverage success, export fallback, and hard-failure boundaries."
        : "Deterministic smoke matrix failed.",
    details: {
      command: "pnpm report:smoke",
      matrix: smokeMatrix,
      stdout: smokeResult.status === 0 ? null : smokeResult.stdout.trim() || null,
      stderr: smokeResult.status === 0 ? null : smokeResult.stderr.trim() || null,
    },
  });
}

const summary = summarizeChecks(checks);
const overallStatus = summary.errors > 0 ? "error" : summary.warnings > 0 ? "warning" : "ok";
const payload = {
  status: overallStatus,
  loadedFiles,
  checks,
  summary,
};

if (isJsonOutput) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Account Atlas preflight: ${overallStatus.toUpperCase()}`);

  for (const check of checks) {
    const prefix = check.status === "ok" ? "[ok]" : check.status === "warning" ? "[warn]" : "[error]";
    console.log(`${prefix} ${check.key}: ${check.summary}`);
  }

  console.log(
    `Summary: ${summary.ok} ok, ${summary.warnings} warnings, ${summary.errors} errors.`,
  );
}

process.exit(summary.errors > 0 ? 1 : 0);
