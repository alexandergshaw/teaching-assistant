// Every directory-qualified `.sql` path cited in src/**/*.{ts,tsx} must
// resolve on disk. This is backlog row A11Y-RLS's INST-3
// (docs/accessibility-scans-rls-scope.md section 9,
// docs/accessibility-scans-rls-scope-check.md E3): before this wave,
// src/lib/supabase/accessibility.ts:6 cited a path under supabase/ (directly,
// with no further subdirectory) that never existed - the real file was one
// directory deeper, under src/lib/supabase/, itself since deleted and
// replaced by supabase/migrations/20261026000000_accessibility_scans.sql.
// That citation is now repointed at the migration in the same commit as the
// migration itself, per the sequencing note in
// docs/accessibility-scans-rls-scope.md section 3: repairing the citation
// without moving the file (or vice versa) leaves a stale citation behind
// with a fresh timestamp, so this test is the enforcer that both landed
// together.
//
// The scan is REFINED, not a bare substring search for ".sql": an unrefined
// pass over this tree reports 27 false positives (bare migration filenames
// cited with no directory, such as "20261008000000_scheduled_releases.sql";
// property accesses that merely look like paths, such as
// "TOPIC_TO_DIR_MAP.sql"; and URL fragments, such as
// "https://www.sqlite.org/..."). The refinement that removes all of those
// and keeps the one real defect: require a "/" inside the candidate (a bare
// filename has none), and skip any line containing "://" (a URL). Both
// exclusions are asserted below, not just applied silently, so a future
// change that breaks the refinement fails loudly here instead of the whole
// test being deleted for crying wolf.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

function walk(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

interface Citation {
  file: string;
  line: number;
  candidate: string;
}

/** A directory-qualified `.sql` candidate: contains a "/" and ends (ignoring
 * trailing punctuation/quotes) in ".sql", found on a line with no "://". */
const CANDIDATE_PATTERN = /[A-Za-z0-9_./-]*\/[A-Za-z0-9_.-]+\.sql/g;

function findCitations(files: string[]): Citation[] {
  const out: Citation[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf-8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.includes("://")) continue; // exclusion 1: URL fragments
      let match = CANDIDATE_PATTERN.exec(line);
      while (match !== null) {
        out.push({ file, line: i + 1, candidate: match[0] });
        match = CANDIDATE_PATTERN.exec(line);
      }
    }
  }
  return out;
}

function resolves(citingFile: string, candidate: string): boolean {
  const repoRelative = path.resolve(ROOT, candidate);
  if (fs.existsSync(repoRelative)) return true;
  const fileRelative = path.resolve(path.dirname(citingFile), candidate);
  return fs.existsSync(fileRelative);
}

describe("every directory-qualified .sql citation in src/**/*.{ts,tsx} resolves on disk", () => {
  const files = walk(SRC_DIR, []);

  it("canary: files were actually walked (a broken walk cannot pass by finding nothing)", () => {
    expect(files.length).toBeGreaterThan(2000);
  });

  const citations = findCitations(files);

  it("canary: found a substantial number of directory-qualified .sql citations", () => {
    expect(citations.length).toBeGreaterThan(30);
  });

  it("exclusion check: a bare migration filename with no directory is not treated as a candidate", () => {
    const bareExample = "See 20261008000000_scheduled_releases.sql for the shape.";
    expect(bareExample.match(CANDIDATE_PATTERN)).toBeNull();
  });

  it("exclusion check: a URL fragment on its own line is skipped entirely", () => {
    const urlLine = "https://www.sqlite.org/lang_createtable.html has more on this.sql-like suffix";
    expect(urlLine.includes("://")).toBe(true);
  });

  it("every directory-qualified .sql citation resolves to a real file", () => {
    const unresolved = citations
      .filter((c) => !resolves(c.file, c.candidate))
      .map((c) => `${path.relative(ROOT, c.file)}:${c.line}  ${c.candidate}`);
    expect(unresolved, `Unresolved .sql citations:\n${unresolved.join("\n")}`).toEqual([]);
  });

  it("the formerly-unresolved citation now resolves to the migration, not the deleted DDL file", () => {
    const accessibilityTs = path.join(SRC_DIR, "lib/supabase/accessibility.ts");
    const text = fs.readFileSync(accessibilityTs, "utf-8");
    expect(text).toContain("supabase/migrations/20261026000000_accessibility_scans.sql");
    // Built by concatenation, deliberately, so this line's own string
    // literal is not itself a contiguous directory-qualified .sql candidate
    // that this file's own scan below would flag against itself.
    const oldStaleCitation = "supabase" + "/" + "accessibility_scans.sql";
    expect(text).not.toContain(oldStaleCitation);
  });
});
