import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// F1 source-text guard: "Ask AI about selected text" is a LIVE control that
// went invisible for an entire commit without any test catching it.
// `className={styles.selectionAiButton}` was dropped from the IconButton in
// commit 6c3729e - MUI's IconButton defaults to `position: static`, so the
// `style={{top, left}}` this component sets stayed syntactically present
// but semantically inert (a static element ignores top/left), and the
// button rendered as an unstyled grey circle at the bottom of <body>, below
// the entire app, never beside the selection it was meant to sit next to.
//
// vitest here is node-env and renders nothing (see docs/DEV_LOOP.md's own
// note that no component in this repo is ever actually mounted by the
// suite) - this is a pure source-text test, the same kind
// contentTab.wiring.test.ts already uses for an analogous "silently
// unregistered" defect. It pins the FACT (does the button's own JSX still
// reference the class that makes `position: fixed` - and therefore the
// inline top/left - take effect), not the exact surrounding markup.
const SOURCE_PATH = path.join(__dirname, "SelectionChatWidget.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

function extractTriggerButtonBlock(src: string): string {
  const anchor = 'title="Ask AI about selected text"';
  const anchorIndex = src.indexOf(anchor);
  if (anchorIndex === -1) {
    throw new Error(
      'SelectionChatWidget.wiring.test.ts: could not find title="Ask AI about selected text" in ' +
        "SelectionChatWidget.tsx - has the selection-chat trigger button been renamed or restructured? " +
        "Update this test's extraction to match."
    );
  }
  // The IconButton opening tag starts a bounded distance before its own
  // title attribute; searching backward for the nearest "<IconButton" from
  // the anchor (rather than a fixed offset) survives prop reordering.
  const tagStart = src.lastIndexOf("<IconButton", anchorIndex);
  if (tagStart === -1) {
    throw new Error(
      "SelectionChatWidget.wiring.test.ts: found the title attribute but no preceding <IconButton - " +
        "has the trigger control been changed to a different element? Update this test's extraction to match."
    );
  }
  const tagEnd = src.indexOf(">", anchorIndex);
  return src.slice(tagStart, tagEnd + 1);
}

describe("SelectionChatWidget's 'Ask AI about selected text' trigger (F1)", () => {
  const triggerBlock = extractTriggerButtonBlock(source);

  it("carries className={styles.selectionAiButton} - the class that makes its inline top/left positioning take effect", () => {
    // Verified able to fail: temporarily removing `className={styles.selectionAiButton}`
    // from the IconButton in SelectionChatWidget.tsx turns this red, while every
    // other test in the repo (including a full `npx tsc --noEmit`) stays green -
    // exactly the "working, correct, and effectively invisible" failure shape
    // this guard exists to catch.
    expect(triggerBlock.includes("styles.selectionAiButton")).toBe(true);
  });

  it("still sets an inline top/left position (the positioning half this class makes meaningful)", () => {
    expect(triggerBlock.includes("style={iconStyle}")).toBe(true);
  });
});

describe(".selectionAiButton (page.module.css) still declares position: fixed", () => {
  const cssPath = path.join(__dirname, "..", "page.module.css");
  const css = readFileSync(cssPath, "utf8");
  const classStart = css.indexOf(".selectionAiButton {");

  it("the class exists and sets position: fixed - without this, the restored className above would be a no-op", () => {
    expect(classStart).toBeGreaterThan(-1);
    const classBlock = css.slice(classStart, css.indexOf("}", classStart));
    expect(classBlock.includes("position: fixed")).toBe(true);
  });
});
