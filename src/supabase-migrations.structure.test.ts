import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * MIGRATION SQL MUST BE LEXICALLY WELL-FORMED, because nothing else here reads it.
 *
 * THE BUG THIS EXISTS TO STOP, which reached production. A `comment on column`
 * string contained an apostrophe that was not doubled:
 *
 *   ... coverage is part of the answer''s meaning ...   <- correct
 *   ... see this migration's header ...                 <- terminates the string
 *
 * Postgres ended the literal at `migration'` and tried to parse the rest of the
 * prose as SQL. The migration failed, and it failed in the ONE place this repo
 * has no local check: migrations auto-apply from a GitHub Action on push, so
 * the first sign of trouble was a red Action after the commit was already on
 * main. tsc, eslint, 19903 tests and the build all passed - none of them read
 * SQL. Worse than an ordinary failed test: the schema change did not land while
 * the TypeScript depending on it did.
 *
 * WHY THE OBVIOUS CHECK DOES NOT WORK, and this is the whole reason the second
 * test below exists. The first version of this file only verified that every
 * string is closed by end of file. That passed on the real bug. A
 * mis-terminated literal does not run to EOF - it closes early, and then the
 * NEXT stray apostrophe (here, `migration's` inside a `--` comment further
 * down) re-opens and re-closes it, so the file balances and an end-of-file
 * check sees nothing at all. It was written to catch this exact defect, run
 * against this exact defect, and stayed green.
 *
 * So the load-bearing check is the second one: an apostrophe between two
 * letters, outside line comments and dollar-quoted bodies. In correct SQL that
 * cannot happen - a real apostrophe is doubled (`answer''s`, which does not
 * match), and a string delimiter is not adjacent to letters on both sides.
 * Verified against all 107 migrations at the time of writing: zero
 * occurrences, and no E'...' strings, which would be the one legitimate
 * exception.
 *
 * Neither test checks that the SQL is VALID - no Postgres runs here. They
 * check the one failure that got through, which is cheap to detect and
 * invisible to every other gate.
 */

const DIR = join(process.cwd(), "supabase", "migrations");
const FILES = readdirSync(DIR).filter((name) => name.endsWith(".sql"));

/**
 * Remove `--` line comments and $tag$ dollar-quoted bodies.
 *
 * Both are places an apostrophe is legitimately bare: comments hold prose, and
 * dollar quoting exists precisely so a function body need not escape anything.
 * Eight migrations use dollar-quoted bodies, so a checker that ignores them
 * reports every one of those as broken.
 */
function stripCommentsAndDollarQuotes(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const close = sql.indexOf(tag, i + tag.length);
      if (close === -1) {
        i = sql.length;
        continue;
      }
      i = close + tag.length;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/** Walk a file and report a string or dollar block still open at EOF. */
function findUnterminated(sql: string): string | null {
  let i = 0;
  let line = 1;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "\n") {
      line += 1;
      i += 1;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "$") {
      const dollar = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (dollar) {
        const tag = dollar[0];
        const close = sql.indexOf(tag, i + tag.length);
        if (close === -1) return `line ${line}: unterminated dollar-quoted block ${tag}`;
        for (let k = i; k < close + tag.length; k += 1) if (sql[k] === "\n") line += 1;
        i = close + tag.length;
        continue;
      }
    }
    if (ch === "'") {
      const openedAt = line;
      i += 1;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === "\n") line += 1;
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) return `line ${openedAt}: unterminated string literal`;
      continue;
    }
    i += 1;
  }
  return null;
}

describe("supabase migrations are lexically well-formed", () => {
  it("finds the migrations at all, so this cannot pass over nothing", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("never leaves a string or dollar block open at end of file", () => {
    const offenders = FILES.map((file) => {
      const found = findUnterminated(readFileSync(join(DIR, file), "utf8"));
      return found ? `${file} ${found}` : null;
    }).filter((found): found is string => found !== null);

    expect(offenders, `Unterminated SQL:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("doubles every apostrophe inside a string literal", () => {
    // THE CHECK THAT ACTUALLY CATCHES THE SHIPPED BUG. See this file's header
    // for why the end-of-file test above does not.
    const offenders: string[] = [];
    for (const file of FILES) {
      const body = stripCommentsAndDollarQuotes(readFileSync(join(DIR, file), "utf8"));
      const pattern = /[A-Za-z]'[A-Za-z]/g;
      let match = pattern.exec(body);
      while (match !== null) {
        const line = body.slice(0, match.index).split("\n").length;
        offenders.push(`${file}:${line} - ${JSON.stringify(body.slice(Math.max(0, match.index - 30), match.index + 30))}`);
        match = pattern.exec(body);
      }
    }

    expect(
      offenders,
      "An apostrophe between two letters, outside a comment. In a SQL string a " +
        "literal apostrophe must be DOUBLED - write ''. A single one ends the " +
        "string early and Postgres parses the remaining prose as SQL. " +
        "Migrations auto-apply on push, so this fails after the commit is " +
        "already on main, leaving code there that expects a schema change which " +
        "never happened.\n" + offenders.join("\n")
    ).toEqual([]);
  });
});
