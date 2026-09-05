// Offline structural test on the migration file itself - no database
// connection at all, just static assertions on the SQL text. This exists
// because the load-bearing decision in
// supabase/migrations/20261011000000_institution_knowledge_overview.sql (a
// STORED GENERATED scope_key carrying ONE non-partial unique index, never
// two partial ones) reviews as plausible either way to a reader skimming for
// "is there a unique index" - the wrong shape only fails at runtime, on the
// very first upsert, with 42P10 ("no unique or exclusion constraint matching
// the ON CONFLICT specification"). A test that could only run against a live
// Postgres would never catch a regression back to the partial-index design
// before it reached production; this one catches it at `npm test`, offline,
// in milliseconds - see the migration's own header comment (and BUILD's C1)
// for the full reasoning this test pins.
//
// Every assertion below runs against the SQL with comment lines stripped
// (stripSqlComments) rather than the raw file text. The header comment
// deliberately narrates the REJECTED partial-index design and quotes the
// generated-column expression as an example, so a raw-text match for
// "create unique index" or the scope_key expression would double-count
// prose that only ever discusses the design, not the two places it is
// actually declared - a canary below proves that distinction actually
// matters (it would fail on raw, unstripped text).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  "supabase/migrations/20261011000000_institution_knowledge_overview.sql"
);

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, "utf-8");
}

/** Drop every line whose trimmed content starts with the SQL line-comment
 * marker. None of this migration's real statements carry a trailing
 * same-line comment, so line-level stripping is sufficient - no statement is
 * partially eaten by this. */
function stripSqlComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

describe("20261011000000_institution_knowledge_overview.sql (offline structural test)", () => {
  const rawSql = readMigration();
  const sql = stripSqlComments(rawSql);

  it("the file exists and is non-trivial (canary against a bad path silently reading nothing)", () => {
    expect(rawSql.length).toBeGreaterThan(2000);
  });

  it("ends its header comment with the idempotency note", () => {
    expect(rawSql).toContain("-- Written idempotently.");
  });

  it("creates both tables, guarded", () => {
    expect(sql).toContain("create table if not exists public.institution_knowledge_summaries");
    expect(sql).toContain("create table if not exists public.institution_knowledge_questions");
  });

  describe("C1: scope_key is ONE non-partial unique index, never two partial ones", () => {
    it("declares scope_key as a STORED GENERATED column coalescing to the nil uuid, on both tables", () => {
      const pattern =
        /scope_key uuid not null generated always as\s*\n\s*\(coalesce\(scope_page_id, '00000000-0000-0000-0000-000000000000'::uuid\)\) stored/g;
      const matches = sql.match(pattern) ?? [];
      expect(matches).toHaveLength(2);
    });

    it("canary: the same pattern over-matches on the RAW (unstripped) text, proving comment-stripping is load-bearing here", () => {
      // The header narrates this exact expression as an example of the
      // rejected-then-adopted design (lines 37-39 of the file). If this
      // canary ever stops over-matching, the header prose changed shape and
      // the "why stripping matters" reasoning above should be re-checked,
      // not silently trusted.
      const pattern =
        /scope_key uuid not null generated always as\s*\n(--)?\s*\(coalesce\(scope_page_id, '00000000-0000-0000-0000-000000000000'::uuid\)\) stored/g;
      const rawMatches = rawSql.match(pattern) ?? [];
      expect(rawMatches.length).toBeGreaterThan(2);
    });

    it("creates exactly one unique index across the whole file", () => {
      const uniqueIndexStatements = sql.match(/create unique index if not exists [^;]+;/g) ?? [];
      expect(uniqueIndexStatements).toHaveLength(1);
    });

    it("that one unique index carries NO where clause - not partial", () => {
      const statementMatch = sql.match(/create unique index[\s\S]*?;/);
      expect(statementMatch).not.toBeNull();
      expect(statementMatch![0].toLowerCase()).not.toContain("where");
    });

    it("the unique index is keyed on exactly (user_id, institution, scope_key)", () => {
      expect(sql).toContain(
        "create unique index if not exists institution_knowledge_summaries_scope_idx\n" +
          "  on public.institution_knowledge_summaries (user_id, institution, scope_key);"
      );
    });

    it("sabotage check: reintroducing a partial-index WHERE clause is caught by the no-where assertion", () => {
      const sabotaged = sql.replace(
        "on public.institution_knowledge_summaries (user_id, institution, scope_key);",
        "on public.institution_knowledge_summaries (user_id, institution, scope_key) where scope_page_id is not null;"
      );
      const statementMatch = sabotaged.match(/create unique index[\s\S]*?;/);
      expect(statementMatch![0].toLowerCase()).toContain("where");
    });

    it("institution_knowledge_questions has no unique index at all - history is append-only by design", () => {
      // Matched as whole statements (up to the terminating semicolon), not a
      // broad substring search - "institution_knowledge_questions" appears
      // many times later in the file (its own table, comments, policies),
      // and an unanchored match would find those instead of proving
      // anything about THIS statement.
      const uniqueIndexStatements = sql.match(/create unique index if not exists [^;]+;/g) ?? [];
      expect(uniqueIndexStatements.every((statement) => !statement.includes("institution_knowledge_questions"))).toBe(
        true
      );
    });
  });

  it("scope_page_id references institution_pages and cascades on delete, on both tables", () => {
    const pattern = /scope_page_id uuid references public\.institution_pages \(id\) on delete cascade/g;
    const matches = sql.match(pattern) ?? [];
    expect(matches).toHaveLength(2);
  });

  it("user_id references auth.users and cascades on delete, on both tables", () => {
    const pattern = /user_id uuid not null references auth\.users \(id\) on delete cascade/g;
    const matches = sql.match(pattern) ?? [];
    expect(matches).toHaveLength(2);
  });

  it("carries no length CHECK constraint on any column (a CHECK would discard a paid-for model answer)", () => {
    // Excludes RLS's "with check (...)" clause, which is a different SQL
    // construct entirely (a policy predicate, not a column constraint) and
    // is asserted separately below. A real column CHECK is never preceded
    // by "with " in this codebase's own migrations (see
    // 20261008000000_scheduled_releases.sql's `check (status in (...))`).
    expect(sql).not.toMatch(/(?<!with )check\s*\(/i);
  });

  it("grounded defaults to true and is a plain stored column, not a view or computed value", () => {
    expect(sql).toContain("grounded boolean not null default true");
  });

  it("declares exactly 4 RLS policies per table (select/insert/update/delete), each guarded by drop-if-exists", () => {
    for (const table of ["institution_knowledge_summaries", "institution_knowledge_questions"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);

      const createPolicies = sql.match(new RegExp(`create policy "[^"]+"\\n\\s*on public\\.${table}`, "g")) ?? [];
      expect(createPolicies).toHaveLength(4);

      const dropPolicies =
        sql.match(new RegExp(`drop policy if exists "[^"]+" on public\\.${table};`, "g")) ?? [];
      expect(dropPolicies).toHaveLength(4);
    }
  });

  it("every policy is owner-scoped on auth.uid() = user_id - no service_role or grant statement anywhere", () => {
    // These are checked on the STRIPPED text specifically because the
    // header prose narrates (in English) that the repo has "zero grant
    // statements and zero service_role policies" - a raw-text search would
    // find that sentence and prove nothing.
    expect(sql.toLowerCase()).not.toContain("grant ");
    expect(sql.toLowerCase()).not.toContain("service_role");

    const usingClauses = sql.match(/using \(auth\.uid\(\) = user_id\)/g) ?? [];
    const withCheckClauses = sql.match(/with check \(auth\.uid\(\) = user_id\)/g) ?? [];
    // 3 `using` policies (select/update/delete) + 1 `with check` policy
    // (insert) per table, times 2 tables.
    expect(usingClauses).toHaveLength(6);
    expect(withCheckClauses).toHaveLength(2);
  });

  it("is idempotent throughout: every create/drop statement guards itself", () => {
    const createTableCount = (sql.match(/create table\b/g) ?? []).length;
    const guardedCreateTableCount = (sql.match(/create table if not exists/g) ?? []).length;
    expect(createTableCount).toBe(2);
    expect(guardedCreateTableCount).toBe(createTableCount);

    const createIndexCount = (sql.match(/create (unique )?index\b/g) ?? []).length;
    const guardedCreateIndexCount = (sql.match(/create (unique )?index if not exists/g) ?? []).length;
    expect(createIndexCount).toBe(2);
    expect(guardedCreateIndexCount).toBe(createIndexCount);

    const createPolicyCount = (sql.match(/create policy\b/g) ?? []).length;
    const dropPolicyIfExistsCount = (sql.match(/drop policy if exists/g) ?? []).length;
    expect(createPolicyCount).toBe(8);
    expect(dropPolicyIfExistsCount).toBe(createPolicyCount);
  });
});
