import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const loadedFiles = [".env", ".env.local"].filter((fileName) => loadEnvFile(fileName));

function formatTimestamp(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const numericValue = Number(trimmed);

    if (Number.isFinite(numericValue)) {
      return new Date(numericValue).toISOString();
    }

    const parsedValue = Date.parse(trimmed);
    return Number.isFinite(parsedValue) ? new Date(parsedValue).toISOString() : trimmed;
  }

  return null;
}

function loadMigrationJournal() {
  const journalPath = path.resolve(process.cwd(), "drizzle/meta/_journal.json");

  if (!existsSync(journalPath)) {
    return [];
  }

  try {
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    const entries = Array.isArray(journal?.entries) ? journal.entries : [];

    return entries.map((entry) => ({
      tag: typeof entry?.tag === "string" ? entry.tag : "unknown",
      createdAt: formatTimestamp(entry?.when),
    }));
  } catch {
    return [];
  }
}

function listSqlMigrationFiles() {
  const migrationsDir = path.resolve(process.cwd(), "drizzle");

  if (!existsSync(migrationsDir)) {
    return [];
  }

  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
}

if (!process.env.DATABASE_URL) {
  console.error(
    JSON.stringify(
      {
        status: "error",
        message: "DATABASE_URL is not set in the shell or env files.",
        loadedFiles,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
});

try {
  const [identity] = await sql`
    select current_database() as current_database, current_user as current_user
  `;
  const tables = await sql`
    select table_schema, table_name
    from information_schema.tables
    where table_schema in ('public', 'drizzle')
    order by 1, 2
  `;
  const reportColumns = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reports'
    order by ordinal_position
  `;
  const [objectPresence] = await sql`
    select
      to_regclass('public.reports') as public_reports,
      to_regclass('drizzle.__drizzle_migrations') as drizzle_migrations
  `;

  let recentMigrations = [];
  let appliedMigrationCount = 0;

  if (objectPresence?.drizzle_migrations) {
    recentMigrations = await sql`
      select id, hash, created_at
      from drizzle.__drizzle_migrations
      order by created_at desc
      limit 10
    `;

    const [migrationCount] = await sql`
      select count(*)::int as value
      from drizzle.__drizzle_migrations
    `;

    appliedMigrationCount = Number(migrationCount?.value ?? 0);
  }

  const journalEntries = loadMigrationJournal();
  const sqlMigrationFiles = listSqlMigrationFiles();
  const expectedMigrationCount = journalEntries.length || sqlMigrationFiles.length;
  const pendingMigrationCount = Math.max(expectedMigrationCount - appliedMigrationCount, 0);

  console.log(
    JSON.stringify(
      {
        status: pendingMigrationCount > 0 ? "warning" : "ok",
        env: {
          databaseUrl: "present",
          openAiApiKey: process.env.OPENAI_API_KEY ? "present" : "absent",
          blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN ? "present" : "absent",
          requestFingerprintSalt: process.env.REQUEST_FINGERPRINT_SALT ? "present" : "absent",
          reportPipelineMode: process.env.REPORT_PIPELINE_MODE ?? "auto",
          loadedFiles,
        },
        database: {
          currentDatabase: identity?.current_database ?? null,
          currentUser: identity?.current_user ?? null,
        },
        tables: tables.map((row) => ({
          schema: row.table_schema,
          name: row.table_name,
        })),
        reports: {
          exists: Boolean(objectPresence?.public_reports),
          columns: reportColumns.map((row) => row.column_name),
        },
        migrations: {
          exists: Boolean(objectPresence?.drizzle_migrations),
          expectedCount: expectedMigrationCount,
          appliedCount: appliedMigrationCount,
          pendingCount: pendingMigrationCount,
          journal: journalEntries.slice(-5),
          files: sqlMigrationFiles,
          recent: recentMigrations.map((row) => ({
            id: row.id,
            hash: row.hash,
            createdAt: formatTimestamp(row.created_at),
          })),
        },
        readiness: {
          databaseConfigured: true,
          reportsTableReady: Boolean(objectPresence?.public_reports),
          migrationsUpToDate: pendingMigrationCount === 0,
          openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
          blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
