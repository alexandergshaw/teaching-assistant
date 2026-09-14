// Fails if the committed docs/BACKLOG.md differs from a fresh render of
// docs/backlog.yml. This is the hand-edit detector Ruling BA-6 requires be
// PROVEN, not assumed: check-generated.test.ts hand-edits a rendered fixture
// and asserts this reports a mismatch.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseBacklogYaml } from "./yaml-codec";
import { renderBacklogMarkdown } from "./render";

export interface CheckGeneratedResult {
  ok: boolean;
  message: string;
}

/** Pure comparison - takes the two file contents directly so tests never need real files on disk. */
export function checkGeneratedText(yamlText: string, markdownText: string): CheckGeneratedResult {
  const items = parseBacklogYaml(yamlText);
  const fresh = renderBacklogMarkdown(items);
  if (fresh === markdownText) {
    return { ok: true, message: "docs/BACKLOG.md matches a fresh render of docs/backlog.yml" };
  }

  const freshLines = fresh.split("\n");
  const actualLines = markdownText.split("\n");
  let firstDiff = 0;
  while (
    firstDiff < freshLines.length &&
    firstDiff < actualLines.length &&
    freshLines[firstDiff] === actualLines[firstDiff]
  ) {
    firstDiff += 1;
  }
  return {
    ok: false,
    message:
      "docs/BACKLOG.md is STALE or hand-edited - it does not match a fresh render of docs/backlog.yml. " +
      `First difference at line ${firstDiff + 1}:\n` +
      `  expected (rendered): ${JSON.stringify(freshLines[firstDiff] ?? "<end of file>")}\n` +
      `  actual (committed):  ${JSON.stringify(actualLines[firstDiff] ?? "<end of file>")}\n` +
      "Run `npm run backlog:render` and commit the result.",
  };
}

const REPO_ROOT = process.cwd();

/** The real-filesystem entry point the CLI calls. */
export function checkGenerated(): CheckGeneratedResult {
  const yamlText = readFileSync(resolve(REPO_ROOT, "docs/backlog.yml"), "utf-8");
  const markdownText = readFileSync(resolve(REPO_ROOT, "docs/BACKLOG.md"), "utf-8");
  return checkGeneratedText(yamlText, markdownText);
}
