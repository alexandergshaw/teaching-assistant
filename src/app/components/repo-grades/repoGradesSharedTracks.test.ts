import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "src/app/components/repo-grades");
const css = readFileSync(join(dir, "repo-grades.module.css"), "utf8");
const grid = readFileSync(join(dir, "RepoGradesGrid.tsx"), "utf8");
const shell = readFileSync(join(dir, "RepoGradesStickyHeader.tsx"), "utf8");

describe("gradebook shared tracks", () => {
  it("keeps the table and its column tracks at narrow widths", () => {
    expect(grid).toContain("<colgroup>");
    expect(grid).toContain("styles.studentTrack");
    expect(css).toMatch(/table-layout:\s*fixed/);
    expect(css).not.toMatch(/\.grid\s+(?:colgroup|thead|tbody|tr|th|td)\s*\{[^}]*display:\s*(?:none|block|flex)/);
    expect(css).not.toMatch(/table\.grid\s*[,\{]/);
  });
  it("keeps student and assignment context visible without a tall sticky header", () => {
    expect(css).toMatch(/\.grid \.studentColumn\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0/);
    expect(css).toMatch(/@media \(max-width: 700px\)\s*\{[\s\S]*?\.grid thead th\s*\{\s*position:\s*static;/);
    expect(css).toMatch(/@media \(max-width: 700px\)\s*\{[\s\S]*?\.cellColumnLabel\s*\{\s*display:\s*block;/);
    expect(grid).toContain('className={styles.cellColumnLabel} aria-hidden="true">{label}');
  });
  it("keeps the scroll region keyboard reachable and cells bounded", () => {
    expect(shell).toMatch(/role="region"[^>]*tabIndex=\{0\}/);
    expect(css).toMatch(/\.stickyShell\s*\{[^}]*overflow:\s*auto/);
    expect(css).toMatch(/\.grid th,\s*\.grid td\s*\{[^}]*border-right:[^}]*border-bottom:/);
  });
});
