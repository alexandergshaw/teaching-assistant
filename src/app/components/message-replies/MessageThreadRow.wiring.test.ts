import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { latestIncomingIndex, MESSAGE_TABLE_COLUMN_COUNT } from "./MessageThreadRow";
import type { ThreadMessage } from "./message-serialization";

// docs/message-replies-acceptance-criteria.md M13 (section 7): the row's
// thread rendering (details/summary, .threadEarlier, "only the latest
// incoming is at --text-primary"), the row-column count, and the two
// same-badge-group badges (In Canvas / Answered). node-env vitest never
// renders a component in this repo, so `latestIncomingIndex` (a real, pure
// function this file exports for exactly this reason) gets a real behaviour
// test, and everything else is pinned as source text - the idiom
// confirmArmButtons.test.ts and redraftRow.wiring.test.ts already use.

function msg(fromMe: boolean, text = "x"): ThreadMessage {
  return { sender: fromMe ? "You" : "Student", text, fromMe, precision: "none" };
}

const SOURCE_PATH = path.join(process.cwd(), "src/app/components/message-replies/MessageThreadRow.tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("latestIncomingIndex (M9/M13 - a real, failable pure-function test)", () => {
  it("finds the LAST message with fromMe === false, scanning from the end", () => {
    expect(latestIncomingIndex([msg(false), msg(true), msg(false), msg(true)])).toBe(2);
  });

  it("returns -1 when every message is fromMe (no incoming message to highlight)", () => {
    expect(latestIncomingIndex([msg(true), msg(true)])).toBe(-1);
  });

  it("returns the only index for a one-message thread", () => {
    expect(latestIncomingIndex([msg(false)])).toBe(0);
  });

  it("SABOTAGE TARGET: does not stop at the FIRST incoming message - a thread answered-then-followed-up must resolve to the later one", () => {
    expect(latestIncomingIndex([msg(false), msg(false), msg(true)])).toBe(1);
  });
});

describe("MessageThreadRow.tsx - M13's thread rendering, pinned as source text", () => {
  const stripped = stripComments(source);

  it("MESSAGE_TABLE_COLUMN_COUNT is 5 - First / Last / Subject / Status / Actions, not the discussion sibling's 5-with-Captured", () => {
    expect(MESSAGE_TABLE_COLUMN_COUNT).toBe(5);
  });

  it('earlier messages (before the latest incoming) render inside <details key={threadExpand ? "open" : "closed"} ref={detailsRef} open={threadExpand}><summary>Earlier in this thread (N)</summary>', () => {
    expect(stripped).toMatch(/<details key=\{threadExpand \? "open" : "closed"\} ref=\{detailsRef\} open=\{threadExpand\}>/);
    expect(stripped).toMatch(/Earlier in this thread \(\$\{earlierMessages\.length\}\)/);
  });

  it("SABOTAGE TARGET: the <details> is gated on earlierMessages.length > 0 - a one-message thread renders no <details> at all", () => {
    expect(stripped).toMatch(/earlierMessages\.length > 0 &&\s*\(\s*<details/);
  });

  it("row.omittedMessages > 0 renders a count paragraph directly after <summary>, inside the <details>", () => {
    const summaryIdx = stripped.indexOf("<summary>");
    const hintIdx = stripped.indexOf("{row.omittedMessages > 0 &&");
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(hintIdx).toBeGreaterThan(summaryIdx);
    const between = stripped.slice(stripped.indexOf("</summary>") + "</summary>".length, hintIdx);
    expect(between.trim()).toBe("");
    expect(stripped).toMatch(/\{row\.omittedMessages > 0 && \(\s*<p className=\{styles\.ghMeta\}>\{`\$\{row\.omittedMessages\} older messages were not kept\.`\}<\/p>/);
  });

  it("earlier messages (and any message after the latest incoming) carry messageStyles.threadEarlier - only the latest incoming itself does not", () => {
    expect(stripped).toMatch(/dim \?\s*messageStyles\.threadEarlier\s*:\s*undefined/);
    // The latest incoming is visibleMessages[0] - dim only when i !== 0, EXCEPT
    // when there is no incoming message at all (idx === -1), which dims every
    // visible message, including index 0.
    expect(stripped).toMatch(/const dimVisibleMessage = \(i: number\) => \(idx === -1 \? true : i !== 0\);/);
    expect(stripped).toMatch(/dim=\{dimVisibleMessage\(i\)\}/);
  });

  it('M13: the "Waiting" pending badge is replaced (not joined) by the Answered badge when a pending row is answered; every other state badge still renders alongside Answered', () => {
    expect(stripped).toMatch(/const showStateBadge = !\(row\.state === "pending" && row\.answered\);/);
    expect(stripped).toMatch(/\{showStateBadge && <span className=\{`\$\{styles\.ghBadge\} \$\{styles\[badge\.variant\]\}`\}>\{badge\.label\}<\/span>\}/);
  });

  it('M17: a "Sent <time>" ghBadgeSuccess badge replaces the handledAt "Copied" badge when row.sent is set', () => {
    expect(stripped).toMatch(/row\.sent \? \(\s*<span className=\{`\$\{styles\.ghBadge\} \$\{styles\.ghBadgeSuccess\}`\}>\{`Sent \$\{formatCapturedTime\(row\.sent\.at\)\}`\}<\/span>\s*\) : row\.handledAt !== undefined \? \(/);
  });

  it('M16: the Saved-to-drafts link is a plain button dispatching openMessageDrafts(), never an <a href="?tab=...">', () => {
    expect(stripped).not.toMatch(/<a href="\?tab=/);
    expect(stripped).toMatch(/<button type="button" className=\{styles\.linkButton\} onClick=\{openMessageDrafts\}>/);
    expect(stripped).toMatch(/import \{ openMessageDrafts \} from "@\/lib\/drafts-nav";/);
  });

  it("the thread scroller carries role=\"group\" and an aria-label naming the student", () => {
    expect(stripped).toMatch(/role="group"\s*\n?\s*aria-label=\{`Thread with \$\{row\.student\}`\}/);
  });

  it("SABOTAGE TARGET: the merged effect sets .open BEFORE reading scrollHeight, in a MOUNT-ONLY effect (empty deps), not on every render", () => {
    const openIdx = stripped.indexOf("detailsRef.current.open = threadExpand");
    const scrollIdx = stripped.indexOf("scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight");
    expect(openIdx).toBeGreaterThan(-1);
    expect(scrollIdx).toBeGreaterThan(openIdx);
    const tail = stripped.slice(scrollIdx, scrollIdx + 90);
    expect(tail).toMatch(/\}, \[\]\);/);
  });

  it('M13: "In Canvas" and "Answered" badges are both ghBadgeNeutral, gated on row.canvas / row.answered respectively', () => {
    expect(stripped).toMatch(/row\.canvas && <span className=\{`\$\{styles\.ghBadge\} \$\{styles\.ghBadgeNeutral\}`\}>In Canvas<\/span>/);
    expect(stripped).toMatch(/row\.answered && <span className=\{`\$\{styles\.ghBadge\} \$\{styles\.ghBadgeNeutral\}`\}>Answered<\/span>/);
  });

  it("the reply TextField carries a per-row accessible name naming the student, not a shared column header", () => {
    expect(stripped).toMatch(/"aria-label": `Reply to \$\{row\.student\}`/);
  });

  it("the row component is wrapped in React.memo - the same discipline DiscussionReplyRow.tsx documents (a controlled multiline TextField per row must not re-render every OTHER row on a keystroke)", () => {
    expect(stripped).toMatch(/export default memo\(MessageThreadRowImpl\);/);
  });
});
