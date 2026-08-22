// "Ask AI" bulk bar row - placement/wiring guard.
//
// docs/modules-selection-ask-ai-acceptance-criteria.md (section A): the row
// must render directly after the Download row and before the module/item
// bulk-action sections, its hook must be threaded with the same export-aware
// identifiers useSelectionDownload already receives, and it must render no
// modal/dialog/popover/fixed-position overlay (D4) - the sticky header it
// lives in is the containing block for `position: fixed` descendants (see
// generatedPreviewModal.wiring.test.ts's own header comment for the full
// stacking-context story this repeats for a new component).
//
// vitest here is node-env and collects only `src/**/*.test.ts`, so nothing
// here is ever rendered - this file reads ModulesView.tsx and
// AskAiSelectionSection.tsx as TEXT, the same idiom
// generatedPreviewModal.wiring.test.ts already uses. What is pinned below is
// FACTS and ORDERING (the row is rendered inside the bulk bar; it comes
// after the Download row; the hook receives the export-aware identifier; the
// row renders no previewBackdrop) - never exact prose spelling, per this
// repo's own "over-specified string assertions have forced contorted
// implementations before" note (source-text-tests-overspecify).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MODULES_VIEW_PATH = join(process.cwd(), "src/app/components/content-tab/ModulesView.tsx");
const ROW_PATH = join(process.cwd(), "src/app/components/content-tab/modules/AskAiSelectionSection.tsx");
const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useSelectionChatContext.ts");

const modulesViewSource = readFileSync(MODULES_VIEW_PATH, "utf8");
const rowSource = readFileSync(ROW_PATH, "utf8");
const hookSource = readFileSync(HOOK_PATH, "utf8");

/** Source with line/block comments stripped, so a name mentioned only in
 * prose (e.g. this very file's own header) is never mistaken for a real
 * render site or import. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("AskAiSelectionSection is wired into ModulesView's bulk bar", () => {
  it("imports both the hook and the row component", () => {
    expect(modulesViewSource).toMatch(/import\s*\{\s*useSelectionChatContext\s*\}\s*from\s*["']\.\/modules\/useSelectionChatContext["']/);
    expect(modulesViewSource).toMatch(/import\s*\{\s*AskAiSelectionSection\s*\}\s*from\s*["']\.\/modules\/AskAiSelectionSection["']/);
  });

  it("renders <AskAiSelectionSection> after <DownloadSelectionSection> and before the module/item bulk sections", () => {
    const stripped = stripComments(modulesViewSource);
    const downloadIdx = stripped.indexOf("<DownloadSelectionSection");
    const askAiIdx = stripped.indexOf("<AskAiSelectionSection");
    const modulesSectionIdx = stripped.indexOf("<BulkModulesSection");
    const itemsSectionIdx = stripped.indexOf("<BulkItemsSection");

    expect(downloadIdx, "DownloadSelectionSection is never rendered").toBeGreaterThan(-1);
    expect(askAiIdx, "AskAiSelectionSection is never rendered").toBeGreaterThan(-1);
    expect(modulesSectionIdx, "BulkModulesSection is never rendered").toBeGreaterThan(-1);
    expect(itemsSectionIdx, "BulkItemsSection is never rendered").toBeGreaterThan(-1);

    // A1: directly after Download, and strictly before either conditional
    // bulk-action section that follows it in the same bar.
    expect(askAiIdx).toBeGreaterThan(downloadIdx);
    expect(askAiIdx).toBeLessThan(modulesSectionIdx);
    expect(askAiIdx).toBeLessThan(itemsSectionIdx);
  });

  it("renders the row inside the same bulk bar the Download row renders in, not merely somewhere in the file", () => {
    // Structural anchor: the bulk bar only exists inside the
    // `(selection.selected.size > 0 || selection.selectedModules.size > 0)`
    // gate. Both the Download and Ask AI render sites must fall inside that
    // same block, or the row would be misplaced outside the bar entirely.
    const stripped = stripComments(modulesViewSource);
    const barGateIdx = stripped.indexOf("styles.bulkBar}");
    expect(barGateIdx, "bulk bar not found").toBeGreaterThan(-1);
    const barCloseIdx = stripped.indexOf("<BulkModulesSection", barGateIdx);
    const askAiIdx = stripped.indexOf("<AskAiSelectionSection", barGateIdx);
    expect(askAiIdx).toBeGreaterThan(barGateIdx);
    expect(askAiIdx).toBeLessThan(barCloseIdx);
  });

  it("threads the hook with the same export-aware identifiers useSelectionDownload receives", () => {
    // A3/D1: the hook needs the export selection's course_hub row id
    // (exportCourseId) and the institution acronym, the same two identifiers
    // useSelectionDownload already receives right above it - not a fresh
    // pair of names that could silently drift from what the sibling hook
    // already threads through from ContentTab.
    const stripped = stripComments(modulesViewSource);
    const callIdx = stripped.indexOf("useSelectionChatContext(");
    expect(callIdx, "useSelectionChatContext is never called").toBeGreaterThan(-1);
    const callEnd = stripped.indexOf(");", callIdx);
    const callArgs = stripped.slice(callIdx, callEnd);
    expect(callArgs).toMatch(/\bcourseUrl\b/);
    expect(callArgs).toMatch(/\bexportCourseId\b/);
    expect(callArgs).toMatch(/\bacronym\b/);
    expect(callArgs).toMatch(/\bexportModules\b/);
    expect(callArgs).toMatch(/\bsetNote\b/);
    expect(callArgs).toMatch(/selection\.selectedMaterialItems/);
    expect(callArgs).toMatch(/selection\.selectedModules/);
    // The live module tree, not the mixed display-tree view - matches what
    // useSelectionDownload's own call site (immediately above) passes.
    // POSITIONAL, not a bare word match: an earlier version of this
    // assertion used a negative lookbehind to exclude `exportModules`, which
    // could never fire (that identifier's capital M means the lowercase
    // pattern never reached the lookbehind at all), leaving the assertion
    // degraded to "the word modules appears somewhere in the arg list" - true
    // for a wrong call as easily as a right one. Pinning the ADJACENCY of the
    // two tree arguments is what actually constrains the argument order.
    expect(callArgs).toMatch(/\bmodules,\s*exportModules,/);
  });

  it("binds the row's busy/onAskAi props to the hook's own return value", () => {
    const stripped = stripComments(modulesViewSource);
    const start = stripped.indexOf("<AskAiSelectionSection");
    expect(start).toBeGreaterThan(-1);
    const end = stripped.indexOf(">", start);
    const tag = stripped.slice(start, end + 1);
    expect(tag).toMatch(/busy=\{selectionChatContext\.busy\}/);
    expect(tag).toMatch(/onAskAi=\{selectionChatContext\.askAi\}/);
  });
});

describe("AskAiSelectionSection renders no modal/overlay (D4)", () => {
  it("contains no previewBackdrop, no createPortal, and no fixed-position styling", () => {
    // Stripped first: this file's own header comment discusses the very
    // stacking-context hazard it avoids (quoting `styles.previewBackdrop` as
    // the thing generatedPreviewModal.wiring.test.ts polices), which would
    // otherwise make this assertion fail for a reason that is not a real
    // violation - the same stripComments-first posture
    // generatedPreviewModal.wiring.test.ts itself takes, and for the same
    // reason (see that file's own header comment on why comments are
    // stripped before any structural check runs).
    const stripped = stripComments(rowSource);
    expect(stripped).not.toContain("styles.previewBackdrop");
    expect(stripped).not.toContain("createPortal");
    expect(stripped).not.toMatch(/position:\s*["']fixed["']/);
  });

  it("renders exactly one button, no dialog/modal shell import", () => {
    const stripped = stripComments(rowSource);
    const buttonCount = [...stripped.matchAll(/<Button\b/g)].length;
    expect(buttonCount).toBe(1);
    // Checked against CODE (imports + JSX tags), not prose: this file's own
    // header comment legitimately discusses "modal"/"dialog" as concepts it
    // deliberately avoids, which a raw substring check over the whole file
    // (including comments) would misread as a violation.
    expect(stripped).not.toMatch(/<(Dialog|Modal|Popover)\b/);
    expect(stripped).not.toMatch(/import\s*\{[^}]*\b(Dialog|Modal|Popover)\b[^}]*\}\s*from/);
  });

  it("declares busy and onAskAi on its props interface", () => {
    const stripped = stripComments(rowSource);
    const marker = "export interface AskAiSelectionSectionProps {";
    const start = stripped.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const end = stripped.indexOf("}", start);
    const body = stripped.slice(start + marker.length, end);
    expect(body).toMatch(/\bbusy\b/);
    expect(body).toMatch(/\bonAskAi\b/);
  });

  it("activation always calls onAskAi - never guarded by the button itself (A7)", () => {
    // The button's own onClick must be a direct, unconditional call - the
    // decision to proceed or refuse lives in the hook, never here. A guarded
    // onClick (e.g. `onClick={() => !busy && onAskAi()}`) would defeat A7's
    // "activation always calls the handler" rule the same way an earlier
    // draft of DownloadSelectionSection was found to.
    const stripped = stripComments(rowSource);
    expect(stripped).toMatch(/onClick=\{onAskAi\}/);
  });
});

describe("useSelectionChatContext exposes the documented { busy, askAi } shape", () => {
  it("exports a function of that name returning busy and askAi", () => {
    expect(hookSource).toMatch(/export function useSelectionChatContext\(/);
    const stripped = stripComments(hookSource);
    expect(stripped).toMatch(/return\s*\{\s*busy,\s*askAi\s*\}/);
  });

  it("imports the fixed contracts from the leaves owned by sets A and B, not local reimplementations", () => {
    // This hook must code AGAINST Contract 1/3, not declare its own copies of
    // SELECTION_CHAT_MAX_ITEMS or a locally-invented server call - a second
    // independent literal for the same cap is exactly the drift risk
    // useSelectionDownload.ts's own header comment warns SELECTION_ARCHIVE_
    // MAX_ITEMS was created to close.
    expect(hookSource).toMatch(/from ["']@\/lib\/chat\/selection-context["']/);
    expect(hookSource).toMatch(/from ["']@\/app\/actions\/selection-chat-context["']/);
    expect(hookSource).toMatch(/from ["']@\/lib\/chat\/open-chat["']/);
    expect(hookSource).not.toMatch(/const SELECTION_CHAT_MAX_ITEMS\s*=/);
  });

  it("assembles the dispatched text via buildSelectionContextBlock, not the raw server string", () => {
    // open-chat.ts's own OpenChatSelectionContext doc comment (owned by set
    // A) specifies its `text` field is "already framed and capped by
    // buildSelectionContextBlock" - built by the bulk bar's Ask AI row
    // BEFORE the event fires. Pinned as a fact (this function is called,
    // and its own `.text` - not the server's raw `materialsText` - is what
    // reaches `openChat`), not as exact surrounding syntax.
    expect(hookSource).toMatch(/buildSelectionContextBlock\(/);
    const stripped = stripComments(hookSource);
    const openChatCallIdx = stripped.indexOf("openChat({");
    expect(openChatCallIdx).toBeGreaterThan(-1);
    const openChatCallEnd = stripped.indexOf(");", openChatCallIdx);
    const openChatArgs = stripped.slice(openChatCallIdx, openChatCallEnd);
    expect(openChatArgs).toMatch(/text:\s*block\.text/);
    expect(openChatArgs).not.toMatch(/result\.materialsText/);
  });

  it("never dispatches openChat on the error or blank-text paths (A5)", () => {
    // Structural anchor: the `if ("error" in result)` branch and the blank-
    // block-text branch must each return before `openChat(` is reached. A
    // crude but effective proxy for "openChat only follows a value read off
    // `result`/`block` after both guards" - the guards return, so openChat
    // can only execute past them.
    const stripped = stripComments(hookSource);
    const errorGuardIdx = stripped.indexOf('"error" in result');
    const blankGuardIdx = stripped.indexOf("!block.text");
    const openChatIdx = stripped.indexOf("openChat(");
    expect(errorGuardIdx).toBeGreaterThan(-1);
    expect(blankGuardIdx).toBeGreaterThan(-1);
    expect(openChatIdx).toBeGreaterThan(-1);
    expect(openChatIdx).toBeGreaterThan(errorGuardIdx);
    expect(openChatIdx).toBeGreaterThan(blankGuardIdx);
  });
});

// ── The wire contract: the last two links in the chain (C2/C5) ─────────────
//
// THIS IS THE SEAM THAT CAN SHIP THE WHOLE FEATURE DEAD WITH EVERY OTHER
// TEST GREEN. Everything above stops at the hook; the remaining hops - the
// FAB putting the held context on the request body, and the route reading
// that same field name back off it - were written by two different agents in
// two different files, and the ONLY thing making them work is that one
// property name is spelled identically in both. Nothing executes that pair
// in this suite (vitest here is node-env and renders nothing, and there is no
// route-handler harness), so a rename on either side would leave the button
// working, the gather succeeding, the chat opening, and the model silently
// never receiving the selection.
//
// Pinned as FACTS - the field name appears on the request body the FAB sends,
// the route reads that same name, and closing the window clears the held
// context - never as exact surrounding syntax, so a reformat or a refactor of
// either file is free while a RENAME is not.
describe("the selection context survives the client/server wire (C2/C5)", () => {
  const FAB_PATH = join(process.cwd(), "src/app/components/AiChatFab.tsx");
  const ROUTE_PATH = join(process.cwd(), "src/app/api/ai-chat/route.ts");
  const fabSource = stripComments(readFileSync(FAB_PATH, "utf8"));
  const routeSource = stripComments(readFileSync(ROUTE_PATH, "utf8"));

  /** The one property name the whole feature hangs on. Declared once here so
   *  this test cannot drift from itself the way the two source files could. */
  const WIRE_FIELD = "selectionContextText";

  it("the FAB sends the field on the /api/ai-chat request body", () => {
    const fetchIdx = fabSource.indexOf('fetch("/api/ai-chat"');
    expect(fetchIdx, "the FAB no longer posts to /api/ai-chat").toBeGreaterThan(-1);
    // Bounded to the fetch call itself, so a stray mention elsewhere in the
    // file could not satisfy this.
    const body = fabSource.slice(fetchIdx, fetchIdx + 1200);
    expect(body).toContain(`${WIRE_FIELD}:`);
  });

  it("the route reads that same field off the request body", () => {
    expect(routeSource).toContain(`body.${WIRE_FIELD}`);
  });

  it("the route declares the field on its RequestBody type", () => {
    const marker = "interface RequestBody {";
    const start = routeSource.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const end = routeSource.indexOf("\n}", start);
    expect(routeSource.slice(start, end)).toContain(WIRE_FIELD);
  });

  it("closing the chat window clears the held selection context (C2)", () => {
    // Session-scoped, exactly like knowledgeContext: closing the window is
    // what ends the conversation the context was loaded for. Without this,
    // a stale selection would silently ground the NEXT conversation.
    const closeIdx = fabSource.indexOf("handleChatClose");
    expect(closeIdx).toBeGreaterThan(-1);
    const closeBody = fabSource.slice(closeIdx, closeIdx + 900);
    expect(closeBody).toMatch(/setSelectionContext\(null\)/);
  });

  it("the FAB sends the context on every message, not only the first", () => {
    // handleSend reads the state directly and lists it as a dependency; a
    // consumed-once design (clearing it after the first send) would break
    // follow-up questions, since the route is stateless per turn.
    expect(fabSource).toMatch(/selectionContext/);
    const sendIdx = fabSource.indexOf("const handleSend");
    expect(sendIdx).toBeGreaterThan(-1);
    const sendBody = fabSource.slice(sendIdx);
    const clearInsideSend = sendBody.slice(0, sendBody.indexOf("const handleChatClose"));
    expect(clearInsideSend).not.toMatch(/setSelectionContext\(null\)/);
  });
});
