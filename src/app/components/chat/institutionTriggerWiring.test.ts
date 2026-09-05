// Wiring/regression guard for the "@institution" typeahead
// (SPEC-TYPEAHEAD.md, group B: popup + input). vitest here is node-env and
// collects only `src/**/*.test.ts` - no component in this repo is ever
// actually rendered (see FabQuickActionsMenu.wiring.test.ts and
// askAiSelection.wiring.test.ts for the same convention this file follows),
// so every check below reads AiChatWindow.tsx / InstitutionTypeahead.tsx as
// TEXT and pins FACTS and ORDERING that a green type-check/lint/build would
// otherwise miss entirely - most importantly the Enter-key collision
// (section 4) and the MUI event-slot trap (section 2), both of which fail
// SILENTLY (every other gate stays green) if gotten wrong.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const WINDOW_PATH = path.join(__dirname, "..", "AiChatWindow.tsx");
const POPUP_PATH = path.join(__dirname, "InstitutionTypeahead.tsx");
const HOOK_PATH = path.join(__dirname, "useInstitutionTrigger.ts");

const windowSource = readFileSync(WINDOW_PATH, "utf8");
const popupSource = readFileSync(POPUP_PATH, "utf8");
const hookSource = readFileSync(HOOK_PATH, "utf8");

/** Strips comments the same conservative way the sibling wiring tests do:
 * block comments anywhere, line comments only when `//` opens the line
 * (after whitespace), so an accurate inline prose comment that happens to
 * mention `styles.foo` or a JSX tag name is never mistaken for real code. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const windowStripped = stripComments(windowSource);
const popupStripped = stripComments(popupSource);
const hookStripped = stripComments(hookSource);

describe("AiChatWindow imports the typeahead popup and hook (group A/B/C seam)", () => {
  it("imports InstitutionTypeahead and useInstitutionTrigger from ./chat", () => {
    expect(windowSource).toMatch(/import InstitutionTypeahead from ["']\.\/chat\/InstitutionTypeahead["']/);
    expect(windowSource).toMatch(/import \{\s*useInstitutionTrigger\s*\}\s*from ["']\.\/chat\/useInstitutionTrigger["']/);
  });

  it("the hook imports the fixed contract from institution-trigger.ts, not a local reimplementation", () => {
    expect(hookSource).toMatch(/from ["']@\/lib\/chat\/institution-trigger["']/);
    expect(hookStripped).toMatch(/\bparseInstitutionTrigger\b/);
    expect(hookStripped).toMatch(/\bfilterInstitutions\b/);
    expect(hookStripped).toMatch(/\borderInstitutions\b/);
    expect(hookStripped).toMatch(/\bapplyInstitutionSelection\b/);
    expect(hookStripped).toMatch(/\bnextHighlightIndex\b/);
    expect(hookStripped).not.toMatch(/MAX_TRIGGER_QUERY_LEN\s*=\s*\d/);
  });

  it("declares the exact SEAM B<->C prop names, all optional", () => {
    const marker = "interface AiChatWindowProps {";
    const start = windowStripped.indexOf(marker);
    expect(start, "AiChatWindowProps interface not found").toBeGreaterThan(-1);
    const end = windowStripped.indexOf("\n}", start);
    const body = windowStripped.slice(start, end);
    for (const name of [
      "placeholder?:",
      "institutionTypeahead?:",
      "institutionNotice?:",
      "sendBlockedReason?:",
      "onClearKnowledgeContext?:",
      "liveMessage?:",
      "liveAlert?:",
    ]) {
      expect(body, `AiChatWindowProps is missing ${name}`).toContain(name);
    }
  });

  it("InstitutionTypeahead.tsx imports page.module.css directly (CSS orphan ratchet, section 8)", () => {
    // A helper that received class names as props instead would orphan
    // every one of them - the orphan-class scan only credits a class to a
    // file that itself literally writes `styles.<name>`.
    expect(popupSource).toMatch(/import styles from ["']\.\.\/\.\.\/page\.module\.css["']/);
  });
});

describe("event slots: onKeyDown/onKeyUp vs onClick/onSelect (section 2)", () => {
  it("slotProps.input carries onKeyDown and onKeyUp, and keeps onPaste", () => {
    const idx = windowStripped.indexOf("slotProps={{");
    expect(idx, "TextField slotProps not found").toBeGreaterThan(-1);
    const inputSlotMatch = windowStripped.slice(idx, idx + 800).match(/input:\s*\{([^}]*)\}/);
    expect(inputSlotMatch, "slotProps.input entry not found").toBeTruthy();
    const inputSlotBody = inputSlotMatch?.[1] ?? "";
    expect(inputSlotBody).toMatch(/onKeyDown:\s*handleKeyDown/);
    expect(inputSlotBody).toMatch(/onKeyUp:\s*handleInputKeyUp/);
    expect(inputSlotBody).toMatch(/onPaste:\s*handlePaste/);
  });

  it("NEVER puts onKeyDown in slotProps.htmlInput - InputBase spreads inputProps after the explicit onKeyDown and would silently override it", () => {
    const idx = windowStripped.indexOf("htmlInput: institutionTypeahead");
    expect(idx, "conditional htmlInput slot not found").toBeGreaterThan(-1);
    // Bounded to just past `onSelect: handleInputCaretEvent` (the last real
    // property of the conditional object) - a boundary search on a bare
    // ": undefined," would stop early, since "aria-controls" and
    // "aria-activedescendant" above both end in exactly that substring.
    const onSelectIdx = windowStripped.indexOf("onSelect: handleInputCaretEvent", idx);
    expect(onSelectIdx, "onSelect not found in the htmlInput slot").toBeGreaterThan(-1);
    const htmlInputBody = windowStripped.slice(idx, onSelectIdx + "onSelect: handleInputCaretEvent".length);
    expect(htmlInputBody).not.toMatch(/onKeyDown/);
    expect(htmlInputBody).not.toMatch(/onKeyUp/);
    expect(htmlInputBody).toMatch(/onClick:\s*handleInputCaretEvent/);
    expect(htmlInputBody).toMatch(/role:\s*"combobox"/);
    expect(htmlInputBody).toMatch(/"aria-expanded":/);
  });
});

describe("Enter key ordering - the central collision (section 4)", () => {
  it("the popup-intercept block's source index precedes the plain handleSend() call, inside handleKeyDown", () => {
    const fnStart = windowStripped.indexOf("const handleKeyDown = (e:");
    expect(fnStart, "handleKeyDown not found").toBeGreaterThan(-1);
    const fnBody = windowStripped.slice(fnStart, fnStart + 2000);

    const popupCheckIdx = fnBody.indexOf("institutionTrigger.open && institutionTrigger.matches.length > 0");
    const plainSendIdx = fnBody.indexOf("handleSend();");
    expect(popupCheckIdx, "popup-open/matches check not found in handleKeyDown").toBeGreaterThan(-1);
    expect(plainSendIdx, "plain handleSend() call not found in handleKeyDown").toBeGreaterThan(-1);
    expect(popupCheckIdx).toBeLessThan(plainSendIdx);
  });

  it("Shift+Enter is never intercepted by the popup branch (the popup's Enter check requires !e.shiftKey)", () => {
    const fnStart = windowStripped.indexOf("const handleKeyDown = (e:");
    const popupCheckIdx = windowStripped.indexOf("institutionTrigger.open && institutionTrigger.matches.length > 0", fnStart);
    const block = windowStripped.slice(popupCheckIdx, popupCheckIdx + 700);
    expect(block).toMatch(/e\.key === "Enter" && !e\.shiftKey/);
  });

  it("zero matches does not intercept Enter - the popup branch is gated on matches.length > 0", () => {
    const fnStart = windowStripped.indexOf("const handleKeyDown = (e:");
    const fnBody = windowStripped.slice(fnStart, fnStart + 400);
    expect(fnBody).toMatch(/institutionTrigger\.matches\.length > 0/);
  });
});

describe("DISMISSAL - the two existing setInput-with-no-onChange paths, plus blur (section 3)", () => {
  it("handleSend resets the trigger after clearing input", () => {
    const idx = windowStripped.indexOf("const handleSend = useCallback(() => {");
    expect(idx, "handleSend not found").toBeGreaterThan(-1);
    const end = windowStripped.indexOf("}, [input, isLoading, onSend, pendingFiles", idx);
    const body = windowStripped.slice(idx, end);
    expect(body).toMatch(/setInput\(""\)/);
    expect(body).toMatch(/institutionTrigger\.reset\(\)/);
    // reset() must come after the text is actually cleared.
    expect(body.indexOf("setInput(\"\")")).toBeLessThan(body.indexOf("institutionTrigger.reset()"));
  });

  it("resendMessage resets the trigger", () => {
    const idx = windowStripped.indexOf("const resendMessage = useCallback(");
    expect(idx, "resendMessage not found").toBeGreaterThan(-1);
    const end = windowStripped.indexOf("}, [isLoading, institutionTrigger]);", idx);
    const body = windowStripped.slice(idx, end);
    expect(body).toMatch(/setInput\(text\)/);
    expect(body).toMatch(/institutionTrigger\.reset\(\)/);
  });

  it("a blur handler exists that resets the trigger, and the TextField is wired to it", () => {
    const idx = windowStripped.indexOf("const handleInputBlur = useCallback(");
    expect(idx, "handleInputBlur not found").toBeGreaterThan(-1);
    const end = windowStripped.indexOf("[institutionTypeahead, institutionTrigger]);", idx);
    const body = windowStripped.slice(idx, end);
    expect(body).toMatch(/institutionTrigger\.reset\(\)/);
    expect(windowStripped).toMatch(/onBlur=\{handleInputBlur\}/);
  });

  it("recompute is wired to onChange, onKeyUp, onClick and onSelect (not onChange alone)", () => {
    expect(windowStripped).toMatch(/onChange=\{handleInputChange\}/);
    const changeIdx = windowStripped.indexOf("const handleInputChange = useCallback(");
    expect(windowStripped.slice(changeIdx, changeIdx + 400)).toMatch(/institutionTrigger\.recompute\(/);

    const keyUpIdx = windowStripped.indexOf("const handleInputKeyUp = useCallback(");
    expect(windowStripped.slice(keyUpIdx, keyUpIdx + 400)).toMatch(/institutionTrigger\.recompute\(/);

    const caretIdx = windowStripped.indexOf("const handleInputCaretEvent = useCallback(");
    expect(windowStripped.slice(caretIdx, caretIdx + 400)).toMatch(/institutionTrigger\.recompute\(/);
  });
});

describe("accessibility (section 7)", () => {
  it("two always-mounted live regions - polite carries role=status + aria-live=polite; assertive carries no role", () => {
    expect(windowStripped).toMatch(/<div role="status" aria-live="polite" style=\{visuallyHidden\}>/);
    const assertiveMatch = windowStripped.match(/<div aria-live="assertive"[^>]*>/);
    expect(assertiveMatch, "assertive live region not found").toBeTruthy();
    expect(assertiveMatch?.[0]).not.toMatch(/role=/);
  });

  it("the knowledge-context strip no longer carries role=status (it now hosts a Clear control)", () => {
    const idx = windowStripped.indexOf("{knowledgeContextSummary && (");
    expect(idx, "knowledge strip render site not found").toBeGreaterThan(-1);
    const end = windowStripped.indexOf("Clear", idx);
    const stripTag = windowStripped.slice(idx, end);
    expect(stripTag).not.toMatch(/role="status"/);
  });

  it("the popup never carries role=dialog (would misclassify it as a modal site)", () => {
    expect(popupStripped).not.toMatch(/role="dialog"/);
  });

  it("options are never focusable (no tabIndex) and every option prevents default on mousedown", () => {
    expect(popupStripped).not.toMatch(/tabIndex/);
    // Lazy multiline match anchored at the single <li> in source (matches.map
    // renders it once per option at runtime, but the JSX literal appears
    // exactly once here) - proves onMouseDown precedes onClick on the SAME
    // element without depending on exact tag-boundary punctuation (both
    // attribute values contain "=>", which would confuse a naive
    // indexOf(">") search).
    expect(popupStripped).toMatch(
      /<li[\s\S]*?onMouseDown=\{\(e\) => e\.preventDefault\(\)\}[\s\S]*?onClick=\{\(\) => onOptionActivate\(code\)\}/
    );
  });

  it("the hint <p> is a sibling of the <ul>, never nested inside it, and zero matches renders no <ul>", () => {
    const ulOpen = popupStripped.indexOf("<ul");
    const ulClose = popupStripped.indexOf("</ul>");
    const pOpen = popupStripped.indexOf("<p ");
    expect(ulOpen).toBeGreaterThan(-1);
    expect(ulClose).toBeGreaterThan(ulOpen);
    expect(pOpen).toBeGreaterThan(-1);
    // The hint renders outside the <ul>...</ul> range entirely (both are
    // conditionally rendered off the SAME `hasMatches` boolean, mutually
    // exclusive, so a real nesting bug would place <p> between the two).
    expect(pOpen < ulOpen || pOpen > ulClose).toBe(true);
  });
});

describe("Send button honors sendBlockedReason", () => {
  it("disables Send when sendBlockedReason is set and uses it as the tooltip", () => {
    const idx = windowStripped.indexOf("onClick={handleSend}");
    expect(idx, "Send IconButton not found").toBeGreaterThan(-1);
    const tagEnd = windowStripped.indexOf("</IconButton>", idx);
    const tag = windowStripped.slice(idx, tagEnd);
    expect(tag).toMatch(/disabled=\{!input\.trim\(\) \|\| isLoading \|\| Boolean\(sendBlockedReason\)\}/);
    expect(tag).toMatch(/title=\{sendBlockedReason \|\| "Send"\}/);
    // Never MUI's `loading` prop (9.0.1 disables with no aria-busy, and
    // IconButton has no loadingPosition - see the repo's own MUI-facts note).
    expect(tag).not.toMatch(/\bloading=/);
  });
});
