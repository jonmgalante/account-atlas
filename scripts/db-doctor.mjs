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

const loadedFiles = [".env", ".env.local"].filter((fileName) => loadEnvFile(fileName));

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

  if (objectPresence?.drizzle_migrations) {
    recentMigrations = await sql`
      select id, hash, created_at
      from drizzle.__drizzle_migrations
      order by created_at desc
      limit 10
    `;
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        env: {
          databaseUrl: "present",
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
          recent: recentMigrations.map((row) => ({
            id: row.id,
            hash: row.hash,
            createdAt:
              row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
          })),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
