import { describe, expect, it } from "vitest";

import { getDatabaseErrorDiagnostics } from "@/server/db/error-diagnostics";

describe("getDatabaseErrorDiagnostics", () => {
  it("extracts nested Postgres relation errors", () => {
    const error = new Error("Failed query: select * from reports") as Error & { cause?: unknown };
    error.cause = Object.assign(new Error('relation "reports" does not exist'), {
      code: "42P01",
      severity: "ERROR",
      schema_name: "public",
      table_name: "reports",
    });

    expect(getDatabaseErrorDiagnostics(error)).toEqual({
      kind: "relation_missing",
      postgresCode: "42P01",
      postgresMessage: 'relation "reports" does not exist',
      postgresSeverity: "ERROR",
      detail: null,
      hint: null,
      schemaName: "public",
      tableName: "reports",
      columnName: null,
    });
  });

  it("returns null when there is no database-shaped error in the cause chain", () => {
    expect(getDatabaseErrorDiagnostics(new Error("Something else failed"))).toBeNull();
  });
});
