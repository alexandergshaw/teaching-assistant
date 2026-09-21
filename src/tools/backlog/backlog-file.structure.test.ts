// THE ENFORCER (plan-v2.md "Enforcement (B5) - the deliverable gets an
// executing gate"). Measured before this file existed: nothing in `npm test`
// parses docs/backlog.yml or reads docs/BACKLOG.md, and `.github/**` has zero
// backlog references. That means the kind/area migration this wave ships
// could pass every other gate - lint, tsc, next build, every OTHER test in
// src/tools/backlog/ - while docs/BACKLOG.md still showed the old four flat
// state-keyed tables, or drifted from docs/backlog.yml the moment someone
// next hand-edits one file and not the other. This file is what makes that
// impossible: it is the one test in the suite that opens the REAL committed
// files on disk, not a fixture, and fails the instant they disagree.
//
// Three separate guarantees, each with its own `it`, because each fails for
// a different reason and a reader chasing a red run should not have to guess
// which invariant broke:
//   1. docs/BACKLOG.md is byte-identical to a fresh render of docs/backlog.yml
//      (the same check backlog:check-generated runs, but exercised by `npm
//      test` - which every gate in this repo already runs - rather than only
//      by a separate npm script an implementer could forget to invoke).
//   2. every row carries a `kind` this repo recognises and an `area` that is
//      registered in src/tools/backlog/areas.ts - the two fields this wave
//      added to the schema. A row with a stray or unregistered value would
//      already throw inside parseBacklogYaml, but asserting it explicitly
//      here means a future reader sees WHY the fixture matters, not just
//      that parsing happened not to throw.
//   3. the row count is a FROZEN LITERAL (31: the 29 this migration produced,
//      plus A14 and A15, the two live defects the N15a seam check found and
//      filed on 2026-09-15 - the bump below is what that filing looked like,
//      and it is the canary working as designed rather than an obstacle),
//      not `.length` compared to itself or to some derived
//      value. A silently dropped row - the exact failure mode a `.yml` merge
//      conflict or a careless hand-edit produces - changes what parses, and
//      a literal is the only assertion that notices when nothing else does.
//      This number must be bumped by hand, in the same commit, whenever a
//      row is legitimately added or removed - never loosened to `.length`
//      to make a future failure convenient.
//
// SABOTAGE-CHECKED 2026-09-15 per this wave's brief: docs/BACKLOG.md was
// hand-edited by one character (a single space inserted into the header
// prose), the suite was run and this file's byte-identity assertion went
// RED with a "first difference" line number, and the file was then restored
// by re-running `npm run backlog:render`. A test that was not watched fail
// is not evidence - this one was watched fail, on this exact file, before
// being trusted.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseBacklogYaml } from "./yaml-codec";
import { renderBacklogMarkdown } from "./render";
import { isBacklogKind } from "./types";
import { isBacklogArea } from "./areas";

const REPO_ROOT = process.cwd();
const YAML_PATH = resolve(REPO_ROOT, "docs/backlog.yml");
const MARKDOWN_PATH = resolve(REPO_ROOT, "docs/BACKLOG.md");

// Frozen literal (see header comment above for why `.length` is not an
// acceptable substitute). Bump this by hand, in the same commit, the next
// time a row is legitimately added to or removed from docs/backlog.yml.
const EXPECTED_ROW_COUNT = 45;

describe("docs/backlog.yml <-> docs/BACKLOG.md, read from the REAL committed files (not a fixture)", () => {
  const yamlText = readFileSync(YAML_PATH, "utf-8");
  const markdownText = readFileSync(MARKDOWN_PATH, "utf-8");
  const items = parseBacklogYaml(yamlText);

  it("has exactly the row count this migration produced - a silently dropped row must fail this, not slide through as a smaller-but-still-green suite", () => {
    expect(items.length).toBe(EXPECTED_ROW_COUNT);
  });

  it("renders docs/backlog.yml byte-for-byte identical to the committed docs/BACKLOG.md", () => {
    const fresh = renderBacklogMarkdown(items);
    expect(fresh).toBe(markdownText);
  });

  it("gives every row a `kind` this repo recognises (bug, feature, or chore - never null, never a stray string)", () => {
    const badRows = items.filter((item) => !isBacklogKind(item.kind));
    expect(badRows.map((r) => r.id)).toEqual([]);
  });

  it("gives every row an `area` registered in src/tools/backlog/areas.ts (never free text, never a typo'd slug)", () => {
    const badRows = items.filter((item) => !isBacklogArea(item.area));
    expect(badRows.map((r) => r.id)).toEqual([]);
  });
});
