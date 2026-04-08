import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "drizzle-kit";

const protectedEnvKeys = new Set(Object.keys(process.env));

function loadEnvFile(fileName: string) {
  const filePath = path.resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
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
}

loadEnvFile(".env");
loadEnvFile(".env.local");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in the shell or .env.local before running Drizzle commands.");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
