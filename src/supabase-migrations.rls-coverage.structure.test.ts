// Every table created by a migration under supabase/migrations must have
// row-level security enabled somewhere in that same directory. This is
// backlog row A11Y-RLS's INST-2 (docs/accessibility-scans-rls-scope.md
// section 9, docs/accessibility-scans-rls-scope-check.md E4): before
// supabase/migrations/20261026000000_accessibility_scans.sql existed, the
// set difference this test computes (created tables minus RLS-enabled
// tables) was the single-element set ['accessibility_scans'] - a table
// declared entirely outside supabase/migrations (in a hand-run DDL file
// formerly under src/lib/supabase/, since deleted) with no RLS
// enable and no policy anywhere in the tree. That is exactly the shape this
// test refuses: it is RED on a tree that has a created-but-unprotected
// table and GREEN once that table's migration lands, with no mutation
// needed to prove the red direction - it was already red before this wave.
//
// Every `create table` / `alter table ... enable row level security`
// candidate is matched against the SQL with `--` line comments and /* */
// block comments stripped first, and TWO structurally different
// create-table detectors are run and compared, so neither a comment (a
// stray "create table" mentioned in prose) nor a single regex's own blind
// spot can silently inflate or deflate either set. The first version of
// this instrument's sibling investigation
// (docs/accessibility-scans-rls-scope.md section 1.1) walked into exactly
// this trap - an unstripped scan matched a `-- ... folded into the CREATE
// TABLE column list above` comment line as a 51st created table.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

function stripComments(sql: string): string {
  // Strip /* */ block comments first (never nested in this codebase's
  // migrations), then `--` line comments.
  const noBlock = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlock
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

function readAllMigrations(): { files: string[]; text: string } {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));
  const text = files.map((file) => stripComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8"))).join("\n");
  return { files, text };
}

/** Instrument 1: `create table <name>`, name may or may not be immediately
 * followed by an opening paren. */
function createdTablesInstrument1(text: string): Set<string> {
  const out = new Set<string>();
  const pattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi;
  let match = pattern.exec(text);
  while (match !== null) {
    out.add(match[1].toLowerCase());
    match = pattern.exec(text);
  }
  return out;
}

/** Instrument 2: same, but requires the name be followed by an opening
 * parenthesis (possibly across whitespace/newlines) - a structurally
 * different detector so the two can be compared rather than trusted alone. */
function createdTablesInstrument2(text: string): Set<string> {
  const out = new Set<string>();
  const pattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(/gi;
  let match = pattern.exec(text);
  while (match !== null) {
    out.add(match[1].toLowerCase());
    match = pattern.exec(text);
  }
  return out;
}

function rlsEnabledTables(text: string): Set<string> {
  const out = new Set<string>();
  const pattern = /alter\s+table\s+(?:public\.)?([a-zA-Z0-9_]+)\s+enable\s+row\s+level\s+security/gi;
  let match = pattern.exec(text);
  while (match !== null) {
    out.add(match[1].toLowerCase());
    match = pattern.exec(text);
  }
  return out;
}

describe("every migration-created table has RLS enabled somewhere in supabase/migrations", () => {
  const { files, text } = readAllMigrations();

  it("canary: migrations were actually read, and are not empty (a broken walk cannot pass by finding nothing)", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(text.length).toBeGreaterThan(50_000);
  });

  const createdA = createdTablesInstrument1(text);
  const createdB = createdTablesInstrument2(text);

  it("canary: the two structurally different create-table detectors agree", () => {
    const onlyInA = [...createdA].filter((name) => !createdB.has(name));
    const onlyInB = [...createdB].filter((name) => !createdA.has(name));
    expect(onlyInA, `instrument 1 only: ${onlyInA.join(", ")}`).toEqual([]);
    expect(onlyInB, `instrument 2 only: ${onlyInB.join(", ")}`).toEqual([]);
    expect(createdA.size).toBeGreaterThan(30);
  });

  it("no created table lacks an RLS enable in supabase/migrations", () => {
    const enabled = rlsEnabledTables(text);
    const missing = [...createdA].filter((name) => !enabled.has(name));
    expect(missing, `created but never RLS-enabled: ${missing.join(", ")}`).toEqual([]);
  });

  it("accessibility_scans specifically is now covered (the table this wave landed a migration for)", () => {
    expect(createdA.has("accessibility_scans")).toBe(true);
    expect(rlsEnabledTables(text).has("accessibility_scans")).toBe(true);
  });
});
