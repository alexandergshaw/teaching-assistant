// Offline structural test on
// supabase/migrations/20261026000000_accessibility_scans.sql itself - no
// database connection, just static assertions on the SQL text. This is the
// same idiom as src/lib/knowledge-overview.migration.test.ts: the
// load-bearing decision here (backlog row A11Y-RLS, branch A1 - deny-all) is
// that this table gets RLS enabled with ZERO policies, because its only
// legitimate accessor is the service-role client, which bypasses RLS
// entirely. A reviewer skimming the file for "is RLS on" would see it is and
// stop looking; the defect this guards against is someone adding an own-row
// policy later (exactly the mistake the migration's own header tells the
// next reader to stop and not make) and this test would then fail on the
// policy count instead of relying on a comment being read.
//
// Every assertion below runs against the SQL with `--` line comments
// stripped, never the raw text. This migration's header narrates the
// deny-all reasoning in prose (including the words "enable row level
// security" and "create policy" as English, not SQL), so a raw-text match
// would double-count prose describing the decision as if it were the
// decision. None of this migration's real statements carry a trailing
// same-line comment (verified by eye - it is a small, hand-written file),
// so line-level stripping (drop any line whose trimmed content starts with
// "--") is sufficient here, unlike a file that might carry inline comments.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  "supabase/migrations/20261026000000_accessibility_scans.sql"
);

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, "utf-8");
}

function stripSqlComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

describe("20261026000000_accessibility_scans.sql (offline structural test)", () => {
  const rawSql = readMigration();
  const sql = stripSqlComments(rawSql);

  it("the file exists and is non-trivial (canary against a bad path silently reading nothing)", () => {
    expect(sql.length).toBeGreaterThan(300);
  });

  it("creates the table, guarded, preserving the retired DDL's shape", () => {
    expect(sql).toContain("create table if not exists public.accessibility_scans");
    expect(sql).toContain("primary key (user_id, institution, course_id, item_type, item_id)");
  });

  it("creates its index, guarded", () => {
    expect(sql).toContain(
      "create index if not exists accessibility_scans_course_idx\n  on public.accessibility_scans (user_id, institution, course_id);"
    );
  });

  it("carries no foreign key to auth.users - deliberate, per branch A1's decision", () => {
    expect(sql).not.toContain("references auth.users");
  });

  it("enables row level security exactly once, on this table", () => {
    const matches = sql.match(/alter table public\.accessibility_scans enable row level security;/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("declares ZERO policies of any kind (deny-all) - the branch A1 decision", () => {
    const createPolicyStatements = sql.match(/create policy\b[^;]*;/g) ?? [];
    expect(createPolicyStatements).toHaveLength(0);
    expect(sql.toLowerCase()).not.toContain("create policy");
    expect(sql.toLowerCase()).not.toContain("grant ");
  });

  it("is idempotent: every create statement guards itself", () => {
    const createTableCount = (sql.match(/create table\b/g) ?? []).length;
    const guardedCreateTableCount = (sql.match(/create table if not exists/g) ?? []).length;
    expect(createTableCount).toBe(1);
    expect(guardedCreateTableCount).toBe(createTableCount);

    const createIndexCount = (sql.match(/create (unique )?index\b/g) ?? []).length;
    const guardedCreateIndexCount = (sql.match(/create (unique )?index if not exists/g) ?? []).length;
    expect(createIndexCount).toBe(1);
    expect(guardedCreateIndexCount).toBe(createIndexCount);
  });

  it("canary: the enable-RLS pattern does NOT match the raw header prose alone - it is a real statement, not narration", () => {
    // The header narrates "enable row level security" in English several
    // times. This canary proves the statement-shaped match above is finding
    // the actual `alter table ... ;` statement and not merely the phrase -
    // by checking the statement form specifically requires the table name
    // and the trailing semicolon, which the prose sentences never carry.
    const proseOnly = rawSql
      .split("\n")
      .filter((line) => line.trim().startsWith("--"))
      .join("\n");
    const statementPattern = /alter table public\.accessibility_scans enable row level security;/g;
    expect(proseOnly.match(statementPattern) ?? []).toHaveLength(0);
  });
});
