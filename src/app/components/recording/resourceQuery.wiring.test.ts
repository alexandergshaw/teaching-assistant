// Wiring guard for RC4 (docs/reply-resource-concepts-acceptance-criteria.md):
// the automatic resource-search path has NO other test surface. Nothing in
// this repo's test suite ever exercises the bulk drain end to end (vitest
// here is node-env and renders no hook/component - see this repo's own
// AGENTS.md), so the five wirings pinned below could each be silently
// unwired - the drain sending the wrong mode, the "auto"/"manual" modes
// swapped, the query map never reaching markResourceSearching, or
// applyReply/editReply's own concepts handling deleted - with the whole
// suite staying green. Fixer pass finding F1.
//
// Each pin below is paired with a discriminating canary: a fixture string in
// the OLD (pre-RC4/RC3) shape that the SAME pattern must NOT match - proving
// the pattern actually distinguishes the fixed wiring from the regression it
// guards against, not merely reporting "clean" without checking anything (a
// hand-rolled scan doing exactly that has shipped in this repo before - see
// discussionReplyResources.wiring.test.ts's own header for the fullest
// account of that class of defect).
//
// Comments are stripped before scanning, same habit as
// discussionReplyResources.wiring.test.ts and GithubGradingPanel.wiring.test.ts.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

function readSource(relativeToThisFile: string): string {
  return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const resourcesHookSource = readSource("./useReplyResources.ts");
const rowsHookSource = readSource("./useReplyRows.ts");

describe("RC4: the drain calls resourceQueryForRow with mode \"auto\"", () => {
  const DRAIN_AUTO = /resourceQueryForRow\(r, "auto"\)/;

  it("canary: the pattern matches the real drain line", () => {
    expect(DRAIN_AUTO.test('const query = resourceQueryForRow(r, "auto");')).toBe(true);
  });

  it("canary: the pattern does NOT match the mode swapped to \"manual\", or the pre-RC4 shape that read r.post directly", () => {
    expect(DRAIN_AUTO.test('const query = resourceQueryForRow(r, "manual");')).toBe(false);
    // The pre-RC4 drain (docs section 0) built `{ id, text: r.post, author:
    // r.author }` directly with no resourceQueryForRow call at all.
    expect(DRAIN_AUTO.test("const posts = candidateRows.map((r) => ({ id: r.id, text: r.post, author: r.author }));")).toBe(
      false
    );
  });

  it("useReplyResources.ts's drain actually calls it this way", () => {
    expect(resourcesHookSource).toMatch(DRAIN_AUTO);
  });
});

describe("RC4: searchRow/dispatchRowSearch use mode \"manual\"", () => {
  const MANUAL_MODE = /resourceQueryForRow\(row, "manual"\)/;

  it("canary: the pattern matches the real searchRow line", () => {
    expect(MANUAL_MODE.test('const query = resourceQueryForRow(row, "manual");')).toBe(true);
  });

  it("canary: the pattern does NOT match the mode swapped to \"auto\", or the deleted deriveRowSearchConcept shape", () => {
    expect(MANUAL_MODE.test('const query = resourceQueryForRow(row, "auto");')).toBe(false);
    // RC4 deleted deriveRowSearchConcept(post, reply, author) entirely - a
    // regression that resurrected it, rather than routing through
    // resourceQueryForRow, must not pass this pin.
    expect(MANUAL_MODE.test("const concept = deriveRowSearchConcept(row.post, row.reply, row.author);")).toBe(false);
  });

  it("useReplyResources.ts's searchRow actually calls it this way", () => {
    expect(resourcesHookSource).toMatch(MANUAL_MODE);
  });

  it("the two modes are wired to two DIFFERENT call sites, never both to the same one", () => {
    // Regression this catches: someone "fixing" a lint warning by making
    // both dispatch paths share one local variable/call, silently losing
    // the auto-vs-manual distinction RC4 exists to make.
    expect(resourcesHookSource).toMatch(/resourceQueryForRow\(r, "auto"\)/);
    expect(resourcesHookSource).toMatch(/resourceQueryForRow\(row, "manual"\)/);
  });
});

describe("RC4/RC3: the drain passes a queryById map into markResourceSearching", () => {
  const DRAIN_MARK_SEARCHING = /markResourceSearching\(postIds, queryById\)/;

  it("canary: the pattern matches the real call", () => {
    expect(DRAIN_MARK_SEARCHING.test("rowsApi.markResourceSearching(postIds, queryById);")).toBe(true);
  });

  it("canary: the pattern does NOT match the pre-RC3 single-argument call (no query recorded)", () => {
    expect(DRAIN_MARK_SEARCHING.test("rowsApi.markResourceSearching(postIds);")).toBe(false);
  });

  it("useReplyResources.ts's drain actually calls it this way, and builds queryById from resourceQueryForRow's own result", () => {
    expect(resourcesHookSource).toMatch(DRAIN_MARK_SEARCHING);
    // queryById must be POPULATED from the same query object the drain's
    // "auto" call above produced, not a second, independent construction.
    expect(resourcesHookSource).toMatch(/queryById\.set\(r\.id, query\)/);
  });
});

describe("RC3: applyReply (useReplyRows.ts) writes concepts from its fourth parameter", () => {
  // Isolate applyReply's own body - see redraftRow.wiring.test.ts's
  // extractRedraftRowBody for the same discipline: a bare substring scan of
  // the whole file could be fooled by doc-comment prose discussing concepts
  // in the abstract.
  function extractApplyReplyBody(src: string): string {
    const start = src.indexOf("const applyReply = useCallback(");
    if (start === -1) throw new Error("applyReply not found in useReplyRows.ts");
    const end = src.indexOf("\n    [commitRows, scheduleSave]", start);
    if (end === -1) throw new Error("applyReply's closing dependency array not found");
    return src.slice(start, end);
  }

  const SIGNATURE = /\(id: string, reply: string, userEdited: boolean = false, concepts\?: readonly string\[\]\) => \{/;
  const CONCEPTS_WRITE = /\.\.\.\(concepts === undefined \? \{\} : \{ concepts: nextConcepts \}\)/;

  it("canary: the signature pattern matches the real four-parameter signature", () => {
    expect(
      SIGNATURE.test(
        '(id: string, reply: string, userEdited: boolean = false, concepts?: readonly string[]) => {'
      )
    ).toBe(true);
  });

  it("canary: the signature pattern does NOT match the pre-RC3 three-parameter shape", () => {
    expect(SIGNATURE.test("(id: string, reply: string, userEdited: boolean = false) => {")).toBe(false);
  });

  it("canary: the concepts-write pattern does NOT match a row spread with no concepts field at all", () => {
    expect(
      CONCEPTS_WRITE.test('{ ...r, reply, userEdited, state: "ready" as const, error: null }')
    ).toBe(false);
  });

  it("useReplyRows.ts's applyReply carries both the four-argument signature and the conditional concepts write", () => {
    const body = extractApplyReplyBody(rowsHookSource);
    expect(body).toMatch(SIGNATURE);
    expect(body).toMatch(CONCEPTS_WRITE);
  });
});

describe("RC3: editReply (useReplyRows.ts) clears concepts on a hand edit", () => {
  const EDIT_CLEARS_CONCEPTS = /\{ \.\.\.r, reply: text, userEdited: true, state: nextState, error: null, concepts: undefined \}/;

  it("canary: the pattern matches the real editReply row-update line", () => {
    expect(
      EDIT_CLEARS_CONCEPTS.test(
        '{ ...r, reply: text, userEdited: true, state: nextState, error: null, concepts: undefined }'
      )
    ).toBe(true);
  });

  it("canary: the pattern does NOT match the pre-RC3 row-update line (no concepts field touched)", () => {
    expect(
      EDIT_CLEARS_CONCEPTS.test('{ ...r, reply: text, userEdited: true, state: nextState, error: null }')
    ).toBe(false);
  });

  it("useReplyRows.ts's editReply actually clears concepts this way", () => {
    expect(rowsHookSource).toMatch(EDIT_CLEARS_CONCEPTS);
  });
});
