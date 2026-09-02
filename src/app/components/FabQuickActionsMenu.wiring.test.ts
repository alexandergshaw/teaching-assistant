import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// Source-text guards for two of F6's accessibility fixes in
// FabQuickActionsMenu.tsx. vitest here is node-env and renders nothing (see
// docs/DEV_LOOP.md's own note that no component in this repo is ever
// actually mounted by the suite), so these pin FACTS about the source
// rather than exercising the rendered DOM - the same convention
// contentTab.wiring.test.ts and SelectionChatWidget.wiring.test.ts already
// use for this class of "silently regresses, every other test stays green"
// defect.
const SOURCE_PATH = path.join(__dirname, "FabQuickActionsMenu.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

function extractMenuOpenTag(src: string): string {
  const start = src.indexOf("<Menu\n");
  const end = src.indexOf(">", start);
  if (start === -1 || end === -1) {
    throw new Error(
      "FabQuickActionsMenu.wiring.test.ts: could not find the <Menu ...> opening tag in " +
        "FabQuickActionsMenu.tsx - has it been restructured? Update this test's extraction to match."
    );
  }
  return src.slice(start, end + 1);
}

describe("FabQuickActionsMenu does not keep closed actions mounted (F6)", () => {
  it("never sets keepMounted on the <Menu> element itself (its own prop list, not merely absent from a comment)", () => {
    // The old SpeedDial kept every action in the DOM at all times (only
    // opacity/transform/pointer-events toggled it invisible), so a screen
    // reader's virtual cursor met seven menuitems on every route whether or
    // not the dial was open. MUI's <Menu keepMounted={false}> (the
    // default) is what fixes this - it does not render MenuItems into the
    // DOM at all while closed. `keepMounted` appearing as a prop on the
    // <Menu> element itself would reintroduce exactly that bug (the file's
    // own header comment mentions the word deliberately, as documentation -
    // this test reads only the element's own opening tag, not the whole
    // file, so that comment can never make this pass for the wrong reason).
    //
    // Verified able to fail: temporarily adding `keepMounted` to the <Menu>
    // element in FabQuickActionsMenu.tsx turns this red, while every other
    // test in the repo stays green.
    const menuTag = extractMenuOpenTag(source);
    expect(menuTag.includes("keepMounted")).toBe(false);
  });
});

describe("Live Class menu entry's accessible name never embeds elapsed time (F6)", () => {
  const liveClassActionMatch = source.match(/key:\s*"live-class"[\s\S]*?disabledReason:\s*liveClassDisabledReason,?\s*\},/);

  it("the Live Class action object exists in the actions list", () => {
    if (!liveClassActionMatch) {
      throw new Error(
        "FabQuickActionsMenu.wiring.test.ts: could not find the 'live-class' action object in " +
          "FabQuickActionsMenu.tsx - has the actions array been restructured? Update this test's extraction to match."
      );
    }
    expect(liveClassActionMatch).toBeTruthy();
  });

  it("its label is the static string \"Live Class\", never interpolated with formatElapsedCompact or elapsedSeconds", () => {
    const block = liveClassActionMatch?.[0] ?? "";
    // Before this fix, the SpeedDial's Live Class action re-derived its
    // `title` (its accessible name, via Tooltip's describeChild=false
    // behavior) from `formatElapsedCompact(liveClass.elapsedSeconds)` once
    // a session was live - changing the control's own NAME once per second
    // and re-rendering the whole dial every tick. The elapsed time belongs
    // only in the fabLiveBadge's role="status" element (AiChatFab.tsx),
    // which already carries it.
    //
    // Verified able to fail: temporarily changing this action's `label` to
    // a template literal that interpolates formatElapsedCompact turns this
    // red, while every other test in the repo stays green.
    expect(block.includes('label: "Live Class"')).toBe(true);
    expect(block.includes("formatElapsedCompact")).toBe(false);
    expect(block.includes("elapsedSeconds")).toBe(false);
  });
});
