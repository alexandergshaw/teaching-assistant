// A23 scan. Run from the repo root: node docs/a23/a23-scan.mjs <dir>
// Relocated from docs/a23-criteria.md Appendix A.2 in round 3 (Ruling Y5).
//
// Known limitation, stated rather than discovered later: the
// "dynamic import( occurrences" counter is a bare regex over raw source and
// counts the English phrase "import (" in comments. Disambiguate any non-zero
// result with:
//   grep -rn "import *(" <dir> --include=*.ts --include=*.tsx | grep -v "\.test\."
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] || "src/app/components/repo-grades";
const BANNED = [/^@\/lib\/grade$/, /^@\/lib\/grade\//, /^@\/lib\/supabase\/server$/, /^next\/headers$/];
const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) return walk(p);
    if (!/\.(ts|tsx)$/.test(n)) return [];
    if (/\.test\.(ts|tsx)$/.test(n) || n.endsWith(".d.ts")) return [];
    return [p];
  });

const files = walk(root).sort();
let total = 0;
const banned = [];
const perFile = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const lineOf = (i) => src.slice(0, i).split("\n").length;
  let n = 0;
  let multi = 0;
  const re = /(^|\n)[ \t]*(import\b[\s\S]*?from\s*(['"])([^'"]+)\3)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    n += 1;
    const stmt = m[2];
    const spec = m[4];
    const start = lineOf(m.index + m[1].length);
    const end = start + stmt.split("\n").length - 1;
    if (end > start) multi += 1;
    if (BANNED.some((b) => b.test(spec))) {
      const kind = /^import\s+type\b/.test(stmt)
        ? "TYPE(keyword)"
        : /^import\s*\{[^}]*\}/.test(stmt) &&
            stmt
              .slice(stmt.indexOf("{") + 1, stmt.indexOf("}"))
              .split(",")
              .filter((s) => s.trim())
              .every((s) => /^\s*type\s/.test(s))
          ? "TYPE(inline-all)"
          : "VALUE";
      banned.push([`${f.replace(/\\/g, "/")}:${start}`, spec, end - start + 1, kind]);
    }
  }
  const reqs = (src.match(/\brequire\s*\(/g) || []).length;
  const dyn = (src.match(/(?<!\.)\bimport\s*\(/g) || []).length;
  total += n;
  perFile.push([f.replace(/\\/g, "/"), n, multi, reqs, dyn]);
}

console.log(`root=${root}`);
console.log(`files scanned = ${files.length}`);
console.log(`import statements (from-bearing) = ${total}`);
console.log(`require( occurrences = ${perFile.reduce((a, r) => a + r[3], 0)}`);
console.log(`dynamic import( occurrences = ${perFile.reduce((a, r) => a + r[4], 0)}`);
console.log("banned-specifier hits:");
for (const b of banned) console.log(`  ${b[0]}  ${b[1]}  lines=${b[2]}  ${b[3]}`);
const GUARDED = [
  "RepoGradeCellControl.tsx",
  "repoGradesCellEdits.ts",
  "useRepoGradesGradingActions.ts",
  "useRepoGradesBulkGrade.ts",
];
console.log("per-file, the four files in REPO_GRADES_CLIENT_FILES (imports / multi-line):");
for (const name of GUARDED) {
  const row = perFile.find((r) => r[0].endsWith("/" + name));
  console.log(`  ${name.padEnd(32)} ${row ? `${row[1]} / ${row[2]}` : "NOT FOUND"}`);
}
