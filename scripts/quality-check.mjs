import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const cwd = process.cwd();
const protectedEnvKeys = new Set(Object.keys(process.env));
const deterministicTests = ["src/server/quality/quality-system.test.ts"];
const liveCanaryTests = ["src/server/quality/live-canary.test.ts"];

function loadEnvFile(fileName) {
  const filePath = path.resolve(cwd, fileName);

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

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }

  return true;
}

function parseDomains() {
  const inlineDomains = process.argv
    .filter((value) => value.startsWith("--domains="))
    .flatMap((value) => value.slice("--domains=".length).split(","));
  const filePath = process.argv.find((value) => value.startsWith("--domains-file="))?.slice("--domains-file=".length);
  const fileDomains = filePath
    ? readFileSync(path.resolve(cwd, filePath), "utf8")
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  return [...new Set([...inlineDomains, ...fileDomains].map((value) => value.trim()).filter(Boolean))];
}

function runVitest(testFiles, extraEnv = {}) {
  const outputFile = path.join(os.tmpdir(), `account-atlas-quality-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const result = spawnSync(
    "pnpm",
    ["vitest", "--run", ...testFiles, "--reporter=json", `--outputFile=${outputFile}`],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        ...extraEnv,
      },
    },
  );
  const report = existsSync(outputFile) ? JSON.parse(readFileSync(outputFile, "utf8")) : null;

  if (existsSync(outputFile)) {
    unlinkSync(outputFile);
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    report,
  };
}

function summarizeDeterministicReport(report) {
  const groups = new Map();

  for (const testResult of report?.testResults ?? []) {
    for (const assertion of testResult.assertionResults ?? []) {
      const groupName = assertion.ancestorTitles?.[0] ?? path.basename(testResult.name);
      const group = groups.get(groupName) ?? { passed: 0, failed: 0 };

      if (assertion.status === "passed") {
        group.passed += 1;
      } else if (assertion.status === "failed") {
        group.failed += 1;
      }

      groups.set(groupName, group);
    }
  }

  return [...groups.entries()].map(([groupName, counts]) => ({
    groupName,
    ...counts,
  }));
}

function summarizeLiveReport(report) {
  const domains = new Map();

  for (const testResult of report?.testResults ?? []) {
    for (const assertion of testResult.assertionResults ?? []) {
      const domain = assertion.ancestorTitles?.[1];

      if (!domain) {
        continue;
      }

      const domainEntry = domains.get(domain) ?? [];
      domainEntry.push({
        section: assertion.title,
        status: assertion.status,
      });
      domains.set(domain, domainEntry);
    }
  }

  return [...domains.entries()].map(([domain, checks]) => ({
    domain,
    checks,
  }));
}

function printDeterministicScorecard(summary) {
  console.log("Deterministic quality fixtures");

  for (const entry of summary) {
    console.log(`  ${entry.groupName}: ${entry.passed} passed, ${entry.failed} failed`);
  }
}

function printLiveScorecard(summary) {
  console.log("Live canaries");

  if (summary.length === 0) {
    console.log("  skipped (no domains provided)");
    return;
  }

  for (const entry of summary) {
    const formattedChecks = entry.checks
      .map((check) => `${check.section}=${check.status === "passed" ? "pass" : "fail"}`)
      .join(", ");
    console.log(`  ${entry.domain}: ${formattedChecks}`);
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const domains = parseDomains();
const deterministicRun = runVitest(deterministicTests);
const deterministicSummary = summarizeDeterministicReport(deterministicRun.report);

printDeterministicScorecard(deterministicSummary);

let liveRun = null;
let liveSummary = [];

if (domains.length > 0) {
  liveRun = runVitest(liveCanaryTests, {
    QUALITY_LIVE_DOMAINS: domains.join(","),
    REPORT_PIPELINE_MODE: "inline",
  });
  liveSummary = summarizeLiveReport(liveRun.report);
}

printLiveScorecard(liveSummary);

const deterministicFailed = deterministicRun.exitCode !== 0;
const liveFailed = liveRun ? liveRun.exitCode !== 0 : false;
const overallPassed = !deterministicFailed && !liveFailed;

console.log(`Overall: ${overallPassed ? "PASS" : "FAIL"}`);

if (!overallPassed) {
  if (deterministicRun.stderr.trim()) {
    console.error(deterministicRun.stderr.trim());
  }

  if (liveRun?.stderr.trim()) {
    console.error(liveRun.stderr.trim());
  }

  process.exit(1);
}
