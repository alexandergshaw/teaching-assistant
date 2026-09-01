import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// A11y regression guard (workflows/lecture UX audit, A1/A3/A9): every <th>
// under this directory must carry a `scope=` attribute - `scope="col"` for a
// column header, `scope="row"` for a row header - or a screen reader has no
// programmatic association between a data cell and the header that names it.
// vitest here is node-env and renders no component (vitest.config.ts), so
// this is a text-level structural guard, not a rendered-DOM assertion -
// matching automation-draft-persistence.test.ts's own regex/text-scan idiom
// (this directory) rather than anything that needs a DOM.
//
// What this catches TODAY (before this guard existed, all three were true):
//   - run-input/RunInputTable.tsx's sortable column headers (A1) and its
//     selection-checkbox/detail headers had no `scope=` at all.
//   - run-results.tsx's five schedule-summary headers had no `scope=`.
// Both are fixed as part of this same change; this test is what keeps them
// (and any future <th> added anywhere under workflows/**) from regressing.
const WORKFLOWS_DIR = path.resolve(process.cwd(), "src/app/components/workflows");

function listTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listTsxFiles(full, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

// Matches one <th ...> opening tag, non-greedy up to its own closing ">" -
// [\s\S] (not a bare ".") so a tag whose props are spread across several
// lines (routine in this codebase's JSX - see AutomationsPanel.tsx) is still
// captured whole rather than truncated at the first newline. A fresh RegExp
// is constructed per call site below rather than sharing one `g`-flagged
// instance, so no call's `lastIndex` state can leak into another's.
const TH_OPEN_TAG_SOURCE = "<th\\b[\\s\\S]*?>";

describe("every <th under workflows/** carries a scope= attribute", () => {
  const files = listTsxFiles(WORKFLOWS_DIR);

  it("finds .tsx files to scan - a check over nothing proves nothing", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("finds at least one <th to prove the scan is live, not a vacuous pass", () => {
    const anyTh = files.some((f) => new RegExp(TH_OPEN_TAG_SOURCE).test(fs.readFileSync(f, "utf-8")));
    expect(anyTh).toBe(true);
  });

  it("never renders a <th without scope=", () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf-8");
      const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
      const matches = source.match(new RegExp(TH_OPEN_TAG_SOURCE, "g")) ?? [];
      for (const tag of matches) {
        if (!tag.includes("scope=")) {
          violations.push(`${rel}: ${tag.replace(/\s+/g, " ").trim()}`);
        }
      }
    }
    expect(violations, `\n${violations.join("\n")}`).toEqual([]);
  });
});
