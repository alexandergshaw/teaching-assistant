import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// CC19 (group H, wave 0): `redraftRow` beside `retryRow` in
// useDiscussionReplies.ts, declared on UseDiscussionRepliesReturn in
// discussion-draft-loop.ts, and threaded panel -> table -> row as
// `onRedraft` (the row control itself is group D2's, wave 1 - this file
// pins the TYPE thread and the hook-side behaviour only, all source-text,
// per this suite's node-env/no-render limits - see discussion-table-view.
// test.ts's own header for that same constraint applied to a sibling
// feature).
// ---------------------------------------------------------------------------

const readSource = (relPath: string): string => fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");

describe("redraftRow wiring (CC19)", () => {
  it("is declared on UseDiscussionRepliesReturn beside retryRow", () => {
    const src = readSource("src/app/components/recording/discussion-draft-loop.ts");
    expect(src).toMatch(/retryRow: \(id: string\) => void;[\s\S]{0,1200}redraftRow: \(id: string\) => void;/);
  });

  it("is defined in useDiscussionReplies.ts with a draftDispatchForce(\"redraftRow\") call", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    expect(src).toMatch(/const redraftRow = useCallback\(/);
    expect(src).toMatch(/enqueueDrafts\(\[id\], draftDispatchForce\("redraftRow"\)\)/);
  });

  it("is returned from the hook, alongside retryRow", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    expect(src).toMatch(/retryRow,\s*\n\s*redraftRow,/);
  });

  // Extracts just redraftRow's OWN function body (from its `useCallback(`
  // down to the matching closing `);`) - not the doc comment immediately
  // above it, which legitimately DISCUSSES tableEpochRef in prose to
  // explain what this function deliberately does not do. A bare substring
  // scan of the whole file would be fooled by that same prose into a false
  // pass even if a real epoch bump were later added to the body, and would
  // also be fooled by a false FAIL off the comment alone - so this isolates
  // the body first.
  function extractRedraftRowBody(src: string): string {
    const start = src.indexOf("const redraftRow = useCallback(");
    if (start === -1) throw new Error("redraftRow not found in useDiscussionReplies.ts");
    const end = src.indexOf("\n  );", start);
    if (end === -1) throw new Error("redraftRow's closing `);` not found");
    return src.slice(start, end);
  }

  it("does not reference tableEpochRef anywhere inside its own body (no epoch bump, unlike redraftAll)", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    const body = extractRedraftRowBody(src);
    expect(body).not.toMatch(/tableEpochRef/);
    // Sanity: prove the extraction actually isolated the body and did not
    // just fail to find anything - the body must still contain the
    // dispatch call this same describe block pins above.
    expect(body).toMatch(/draftDispatchForce\("redraftRow"\)/);
  });

  it("appends to logRetries using the same event shape retryRow uses", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    const body = extractRedraftRowBody(src);
    expect(body).toMatch(/setLogRetries\(\(prev\) => \[\.\.\.prev, \{ at: new Date\(\)\.toISOString\(\), rowId: id \}\]\)/);
  });

  it("\"redraftRow\" is a member of DraftDispatchSource and draftDispatchForce returns true for it", () => {
    const src = readSource("src/app/components/recording/discussion-capture.ts");
    expect(src).toMatch(/export type DraftDispatchSource = [^;]*"redraftRow"/);
    // The whole draftDispatchForce function body, so the true-branch is
    // pinned regardless of operand order.
    const fnStart = src.indexOf("export function draftDispatchForce(");
    const fnEnd = src.indexOf("\n}", fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/source === "redraftRow"/);
  });

  it("the pinned draftDispatchForce policy enumeration in discussion-capture.test.ts includes redraftRow", () => {
    const src = readSource("src/app/components/recording/discussion-capture.test.ts");
    expect(src).toMatch(/draftDispatchForce\("redraftRow"\)\)\.toBe\(true\)/);
  });

  it("is threaded DiscussionRepliesPanel.tsx -> DiscussionReplyTable.tsx (prop) -> DiscussionReplyRow.tsx (prop) as onRedraft", () => {
    const panel = readSource("src/app/components/recording/DiscussionRepliesPanel.tsx");
    const table = readSource("src/app/components/recording/DiscussionReplyTable.tsx");
    const row = readSource("src/app/components/recording/DiscussionReplyRow.tsx");

    // Panel: destructures redraftRow from the hook and passes it to the table.
    expect(panel).toMatch(/\bredraftRow\b/);
    expect(panel).toMatch(/redraftRow=\{redraftRow\}/);

    // Table: declares the prop on its own props type, destructures it, and
    // forwards it to each row as onRedraft.
    expect(table).toMatch(/redraftRow: \(id: string\) => void;/);
    expect(table).toMatch(/onRedraft=\{redraftRow\}/);

    // Row: declares onRedraft on DiscussionReplyRowProps only - group D2
    // (wave 1) is the one that destructures it and renders the button.
    expect(row).toMatch(/onRedraft: \(id: string\) => void;/);
  });
});

// ---------------------------------------------------------------------------
// Section 10, CC20 (group D2, wave 1): the row-level "Redraft" control - a
// source-text assertion pins that "Redraft" renders with loading while
// drafting and not on a skipped row (the sentence section 10's own "Tests"
// paragraph asks for), plus the arming condition CC20 states in prose. Pinned
// on FACT and ORDERING (which flag drives `loading`, that the whole cluster
// is gated on `!skipped`, which two fields drive arming) rather than on
// incidental spelling, so a harmless rename does not turn this red.
// ---------------------------------------------------------------------------

describe("row-level Redraft control (CC20, section 10)", () => {
  it('renders "Redraft" with loading tied to state === "drafting"', () => {
    const src = readSource("src/app/components/recording/DiscussionReplyRow.tsx");
    expect(src).toMatch(/redraftDrafting = row\.state === "drafting"/);
    expect(src).toMatch(/redraftLabel = "Redraft"/);
    // Fixer pass finding 1: exactly ONE mounted element carries `loading` -
    // the prior two-branch version (a plain Button alongside ConfirmArmButtons,
    // each with its own `loading={redraftDrafting}`) swapped component TYPE
    // the moment `applyReply` reset `row.userEdited` as a new draft landed,
    // dropping focus on a confirmed Redraft at landing. A SINGLE
    // ConfirmArmButtons, always mounted, is the fix - so this count is 1, not
    // 2 as it was before the fix (widening this pin, never weakening it: two
    // occurrences would mean the swap-prone branch pair is back).
    expect(src.match(/loading=\{redraftDrafting\}/g)?.length).toBe(1);
  });

  it("does not render for a skipped row, and is a single ConfirmArmButtons with no sibling plain-Button branch", () => {
    const src = readSource("src/app/components/recording/DiscussionReplyRow.tsx");
    expect(src).toMatch(/\{!skipped && \(\s*<ConfirmArmButtons/);
    // Sabotage guard: the old ternary (a second, plain <Button> branch that
    // rendered instead of ConfirmArmButtons whenever redraftNeedsConfirm was
    // false) must not have come back in this cluster - that was exactly the
    // component-type swap the fixer pass removed. Isolate the Redraft
    // cluster's own source range (from "Copy reply", the button just before
    // this cluster, through the ConfirmArmButtons element's own closing
    // `/>`) so this does not accidentally match some OTHER Button/ternary
    // pair elsewhere in the file.
    const clusterStart = src.indexOf("Copy reply");
    const armStart = src.indexOf("<ConfirmArmButtons", clusterStart);
    const armEnd = src.indexOf("/>", armStart);
    const cluster = src.slice(clusterStart, armEnd + 2);
    expect(cluster).not.toMatch(/redraftNeedsConfirm \?/);
    expect(cluster).not.toMatch(/<Button[\s\S]*?onClick=\{\(\) => onRedraft\(row\.id\)\}/);
  });

  it("arms (ConfirmArmButtons) when row.userEdited or the row's handledAt is set, otherwise fires on one click via onArm", () => {
    const src = readSource("src/app/components/recording/DiscussionReplyRow.tsx");
    expect(src).toMatch(/redraftNeedsConfirm = row\.userEdited \|\| handledAt !== undefined/);
    // Fixer pass finding 1: the arm/confirm-vs-one-click distinction now
    // lives INSIDE the single ConfirmArmButtons' own `armed`/`onArm` props,
    // not in which component is mounted - `armed` folds `redraftNeedsConfirm`
    // in (so a row that needs no confirmation always shows the idle face),
    // and `onArm` fires the redraft directly for that same case rather than
    // arming.
    expect(src).toMatch(/armed=\{redraftNeedsConfirm && redraftArmed\}/);
    expect(src).toMatch(/if \(redraftNeedsConfirm\) setRedraftArmed\(true\);\s*\n\s*else onRedraft\(row\.id\);/);
  });
});
