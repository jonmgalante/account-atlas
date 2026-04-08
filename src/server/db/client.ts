import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverEnv } from "@/env/server";
import * as schema from "@/server/db/schema";

export type AccountAtlasDatabase = PostgresJsDatabase<typeof schema>;
type AccountAtlasSqlClient = ReturnType<typeof postgres>;

export class DatabaseConfigError extends Error {
  constructor(message = "DATABASE_URL is not configured on the server.") {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

declare global {
  var __accountAtlasDb: AccountAtlasDatabase | undefined;
  var __accountAtlasSql: AccountAtlasSqlClient | undefined;
}

function createDatabaseClient() {
  if (!serverEnv.DATABASE_URL) {
    throw new DatabaseConfigError();
  }

  const sql = postgres(serverEnv.DATABASE_URL, {
    max: 5,
    prepare: false,
  });

  const db = drizzle(sql, { schema });

  globalThis.__accountAtlasSql = sql;
  globalThis.__accountAtlasDb = db;

  return db;
}

export function getDb() {
  return globalThis.__accountAtlasDb ?? createDatabaseClient();
}

export async function closeDb() {
  if (!globalThis.__accountAtlasSql) {
    return;
  }

  await globalThis.__accountAtlasSql.end();
  globalThis.__accountAtlasSql = undefined;
  globalThis.__accountAtlasDb = undefined;
}

export function isDatabaseConfigError(error: unknown): error is DatabaseConfigError {
  return error instanceof DatabaseConfigError;
}
