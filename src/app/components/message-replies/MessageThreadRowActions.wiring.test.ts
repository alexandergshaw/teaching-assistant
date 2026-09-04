import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// docs/message-replies-acceptance-criteria.md M14 (section 7): the per-row
// control cluster order, the Send/Redraft ConfirmArmButtons contract (tone,
// idle spelling, consequence wiring), "one armed control per row", and
// Skip/Mark as handled/Remove living in the More menu rather than the
// visible cluster. Source-text pins, the same idiom confirmArmButtons.
// test.ts and redraftRow.wiring.test.ts already use for a file this repo's
// node-env vitest can never render.

const SOURCE_PATH = path.join(process.cwd(), "src/app/components/message-replies/MessageThreadRowActions.tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("MessageThreadRowActions.tsx - M14's control cluster, pinned as source text", () => {
  const stripped = stripComments(source);

  it('M14 order: "Copy reply" precedes Save-as-draft, which precedes Send, which precedes Redraft, which precedes the hover-reveal reorder pair, which precedes the More menu trigger', () => {
    const copyIdx = stripped.search(/>\s*Copy reply\s*<\/Button>/);
    const saveIdx = stripped.search(/>\s*Save as draft\s*<\/Button>/);
    const sendIdx = stripped.indexOf('idleLabel="Send"');
    const redraftIdx = stripped.indexOf('idleLabel="Redraft"');
    const hoverIdx = stripped.indexOf("panelStyles.hoverReveal");
    const moreIdx = stripped.indexOf("More actions");
    for (const i of [copyIdx, saveIdx, sendIdx, redraftIdx, hoverIdx, moreIdx]) expect(i).toBeGreaterThan(-1);
    expect(copyIdx).toBeLessThan(saveIdx);
    expect(saveIdx).toBeLessThan(sendIdx);
    expect(sendIdx).toBeLessThan(redraftIdx);
    expect(redraftIdx).toBeLessThan(hoverIdx);
    expect(hoverIdx).toBeLessThan(moreIdx);
  });

  it('Send is a ConfirmArmButtons with tone="danger", idleVariant="outlined", idleLabel="Send", confirmLabel="Confirm send"', () => {
    const idx = stripped.indexOf('idleLabel="Send"');
    const tag = stripped.slice(stripped.lastIndexOf("<ConfirmArmButtons", idx), idx + 400);
    expect(tag).toMatch(/tone="danger"/);
    expect(tag).toMatch(/idleVariant="outlined"/);
    expect(tag).toMatch(/confirmLabel="Confirm send"/);
  });

  it('Redraft is a ConfirmArmButtons with tone="warning", idleVariant="outlined", idleLabel="Redraft", confirmLabel="Confirm redraft"', () => {
    const idx = stripped.indexOf('idleLabel="Redraft"');
    const tag = stripped.slice(stripped.lastIndexOf("<ConfirmArmButtons", idx), idx + 400);
    expect(tag).toMatch(/tone="warning"/);
    expect(tag).toMatch(/idleVariant="outlined"/);
    expect(tag).toMatch(/confirmLabel="Confirm redraft"/);
  });

  it('SABOTAGE TARGET: "one armed control per row" - exactly ONE armed-state slot covering Send, Redraft AND Remove, not a second independent removeArmed boolean', () => {
    const stateDecls = stripped.match(/const \[armed, setArmed\] = useState</g) ?? [];
    expect(stateDecls.length).toBe(1);
    expect(stripped).not.toMatch(/removeArmed, setRemoveArmed/);
    // All three controls' own `armed` prop/derivation come from that ONE slot.
    expect(stripped).toMatch(/armed=\{sendArmed\}/);
    expect(stripped).toMatch(/armed=\{redraftArmed\}/);
    expect(stripped).toMatch(/const sendArmed = armed\?\.kind === "send"/);
    expect(stripped).toMatch(/const redraftArmed = armed\?\.kind === "redraft"/);
    expect(stripped).toMatch(/const removeArmed = armed\?\.kind === "remove"/);
  });

  it("the arm signature folds in row.reply, so any edit (a hand edit or a fresh draft landing) disarms by construction - Send, Redraft AND Remove all key through it", () => {
    expect(stripped).toMatch(/JSON\.stringify\(\[rowId, kind, reply\]\)/);
    expect(stripped).toMatch(/armSignature\(row\.id, "send", row\.reply\)/);
    expect(stripped).toMatch(/armSignature\(row\.id, "redraft", row\.reply\)/);
    expect(stripped).toMatch(/armSignature\(row\.id, "remove", row\.reply\)/);
  });

  it('Send\'s consequence paragraph is gated on sendArmed and names the sends-to-Canvas, cannot-be-undone text', () => {
    expect(stripped).toMatch(
      /\{sendArmed && \(\s*<p id=\{sendConsequenceId\}[\s\S]{0,120}This sends the reply to \$\{row\.student\} in Canvas\. It cannot be undone\./
    );
  });

  it("Send's ConfirmArmButtons is wired to the SAME consequenceId the consequence paragraph declares (aria-describedby resolves through ConfirmArmButtons itself)", () => {
    const sendIdx = stripped.indexOf('idleLabel="Send"');
    const tag = stripped.slice(stripped.lastIndexOf("<ConfirmArmButtons", sendIdx), sendIdx + 500);
    expect(tag).toMatch(/consequenceId=\{sendConsequenceId\}/);
  });

  it("no onBlur anywhere in this file (repo-wide rule: never on an element with a consequence aria-describedby)", () => {
    expect(stripped).not.toMatch(/onBlur/);
  });

  it('Skip / Mark as handled / Remove live inside the More <Menu>, AFTER the menu trigger IconButton - not in the visible cluster', () => {
    const menuOpenIdx = stripped.indexOf("<Menu");
    const skipIdx = stripped.indexOf("Skip - no reply needed");
    const handledIdx = stripped.indexOf('"Clear handled" : "Mark as handled"');
    const removeIdx = stripped.indexOf('"Remove"');
    for (const i of [menuOpenIdx, skipIdx, handledIdx, removeIdx]) expect(i).toBeGreaterThan(-1);
    expect(skipIdx).toBeGreaterThan(menuOpenIdx);
    expect(handledIdx).toBeGreaterThan(menuOpenIdx);
    expect(removeIdx).toBeGreaterThan(menuOpenIdx);
  });

  it("Remove itself carries its own two-click MenuItem arm (label swaps to Confirm removal, a Cancel MenuItem appears while armed), sharing the SAME armed slot Send/Redraft use", () => {
    expect(stripped).toMatch(/const removeArmed = armed\?\.kind === "remove" && isConfirmArmed\(armed\.signature, removeSignature\);/);
    expect(stripped).toMatch(/setArmed\(\{ kind: "remove", signature: removeSignature \}\);/);
    expect(stripped).toMatch(/"Confirm removal"/);
  });

  it("M16: canSaveOrSend requires canvas AND a non-empty reply AND excludes an already-sent row", () => {
    expect(stripped).toMatch(/const canSaveOrSend = !!row\.canvas && !!row\.reply && !row\.sent;/);
  });

  it("Save as draft carries no title tooltip - the dead M15/M16 hint overlap is gone now that both hints key off row.matchOutcome/row.canvas directly", () => {
    const idx = stripped.indexOf("Save as draft");
    const tag = stripped.slice(stripped.lastIndexOf("<Button", idx), idx);
    expect(tag).not.toMatch(/title=/);
  });

  it('M17: the sendError block reads row.sendError (not a component-state/derived prop), rendering it as a .fieldHint line plus the Check control', () => {
    expect(stripped).toMatch(/\{row\.sendError && \(/);
    expect(stripped).toMatch(/<p className=\{styles\.fieldHint\}>\{row\.sendError\}<\/p>/);
    expect(stripped).not.toMatch(/sendError: string \| undefined/);
  });

  it('M15: matchOutcome === "none" and "ambiguous" render distinct fieldHint text, never before a match pass has examined the row', () => {
    expect(stripped).toMatch(
      /\{row\.matchOutcome === "none" && \(\s*<p className=\{styles\.fieldHint\}>Not found in your Canvas inbox - copy the reply and send it there yourself\.<\/p>/
    );
    expect(stripped).toMatch(
      /\{row\.matchOutcome === "ambiguous" && \(\s*<p className=\{styles\.fieldHint\}>More than one Canvas conversation matches this subject and student - reply in Canvas\.<\/p>/
    );
    expect(stripped).not.toMatch(/courseSelected/);
  });
});
