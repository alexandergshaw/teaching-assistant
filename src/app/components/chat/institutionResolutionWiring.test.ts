import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// Source-text guards for AiChatFab.tsx's institution-typeahead RESOLUTION
// wiring (institution-typeahead spec, sections 5/6/10 - Group C). vitest here
// is node-env and renders nothing (see docs/DEV_LOOP.md's own note that no
// component in this repo is ever actually mounted by the suite), so these
// pin FACTS about the source rather than exercising the rendered DOM - the
// same convention FabQuickActionsMenu.wiring.test.ts and
// SelectionChatWidget.wiring.test.ts already use for this class of
// "silently regresses, every other test stays green" defect.
const SOURCE_PATH = path.join(__dirname, "..", "AiChatFab.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

function extractFunctionBlock(src: string, constName: string): string {
  const marker = `const ${constName} = useCallback(`;
  const start = src.indexOf(marker);
  if (start === -1) {
    throw new Error(
      `institutionResolutionWiring.test.ts: could not find '${marker}' in AiChatFab.tsx - ` +
        "has this handler been renamed or restructured? Update this test's extraction to match."
    );
  }
  // This file formats every multi-line useCallback's closing exactly as
  // "\n  );" (the call's own closing paren, 2-space indented) - see
  // handleSend/handleSelectInstitution for the pattern this relies on.
  const end = src.indexOf("\n  );", start);
  if (end === -1) {
    throw new Error(
      `institutionResolutionWiring.test.ts: could not find the closing '  );' for '${constName}' - ` +
        "has its formatting changed? Update this test's extraction to match."
    );
  }
  return src.slice(start, end);
}

function extractPropObjectBlock(src: string, anchor: string): string {
  const start = src.indexOf(anchor);
  if (start === -1) {
    throw new Error(
      `institutionResolutionWiring.test.ts: could not find '${anchor}' in AiChatFab.tsx - ` +
        "has this prop been renamed or restructured? Update this test's extraction to match."
    );
  }
  const end = src.indexOf("}}", start);
  if (end === -1) {
    throw new Error(`institutionResolutionWiring.test.ts: found '${anchor}' but no closing '}}'.`);
  }
  return src.slice(start, end + 2);
}

const handleSelectInstitutionBlock = extractFunctionBlock(source, "handleSelectInstitution");

describe("AiChatFab resolves institutions through the existing action, never a new grounding path (spec section 5)", () => {
  it("imports listInstitutionPageSummariesAction - the existing, owner-scoped action (AC9: a typeahead that renders but never resolves ids is the failure to avoid)", () => {
    expect(/import\s*\{[^}]*\blistInstitutionPageSummariesAction\b[^}]*\}\s*from/.test(source)).toBe(true);
  });

  it("actually calls listInstitutionPageSummariesAction (imported and used, not merely imported)", () => {
    const callCount = (source.match(/listInstitutionPageSummariesAction\(/g) ?? []).length;
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});

describe("AiChatFab imports the shared cap rather than re-typing it as a literal (spec section 5, seam A -> C)", () => {
  it("imports MAX_KNOWLEDGE_CONTEXT_PAGE_IDS from the shared leaf src/lib/chat/knowledge-context.ts", () => {
    expect(
      /import\s*\{[^}]*\bMAX_KNOWLEDGE_CONTEXT_PAGE_IDS\b[^}]*\}\s*from\s*["']@\/lib\/chat\/knowledge-context["']/.test(
        source
      )
    ).toBe(true);
  });

  it("slices the resolved pages with the imported constant, never a hardcoded 100 (the exact seam route.ts also imports this cap from)", () => {
    // Verified able to fail: temporarily replacing MAX_KNOWLEDGE_CONTEXT_PAGE_IDS
    // with the literal 100 in the .slice() call below turns this red, while
    // tsc and every other test stay green (100 is a valid number either way).
    expect(source.includes(".slice(0, MAX_KNOWLEDGE_CONTEXT_PAGE_IDS)")).toBe(true);
    expect(source.includes(".slice(0, 100)")).toBe(false);
  });
});

describe("AiChatFab renders the strip through knowledgeContextStripText, never an inline template (spec section 6, the strip fix)", () => {
  it("imports knowledgeContextStripText from the shared leaf", () => {
    expect(
      /import\s*\{[^}]*\bknowledgeContextStripText\b[^}]*\}\s*from\s*["']@\/lib\/chat\/knowledge-context["']/.test(
        source
      )
    ).toBe(true);
  });

  it("calls knowledgeContextStripText for BOTH the server-confirmed branch and the pre-response institution branch, not just one", () => {
    // The defect this group fixes: once knowledgeContextInfo was set (from
    // the FIRST reply onward), the strip used to drop both the institution
    // name and the cap disclosure. Two call sites are required: one for
    // knowledgeContextInfo present, one for knowledgeContext.institution
    // present with nothing confirmed yet (AC5 must not wait for a reply to
    // disclose the cap).
    const callCount = (source.match(/knowledgeContextStripText\(/g) ?? []).length;
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("never hand-rolls the 'knowledge base:' prefix as a template literal (that duplication IS the regression)", () => {
    expect(source.includes("knowledge base: ${")).toBe(false);
    expect(source.includes("knowledge base:${")).toBe(false);
  });
});

describe("AiChatFab passes all four institutionTypeahead fields to AiChatWindow (spec section 10, seam B <-> C)", () => {
  const block = extractPropObjectBlock(source, "institutionTypeahead={{");

  it("passes institutions", () => {
    expect(/\binstitutions\b/.test(block)).toBe(true);
  });

  it("passes activeInstitution", () => {
    expect(/\bactiveInstitution\b/.test(block)).toBe(true);
  });

  it("passes loadedInstitution", () => {
    expect(/\bloadedInstitution\s*:/.test(block)).toBe(true);
  });

  it("passes onSelect", () => {
    expect(/\bonSelect\s*:/.test(block)).toBe(true);
  });
});

describe("handleSelectInstitution never sets an empty/wrong knowledgeContext on a bad outcome (spec section 9: zero pages and failure both refuse to set context)", () => {
  it("the zero-pages branch returns before ever calling setKnowledgeContext - an empty context would make the strip lie", () => {
    const start = handleSelectInstitutionBlock.indexOf("if (total === 0) {");
    expect(start).toBeGreaterThan(-1);
    const end = handleSelectInstitutionBlock.indexOf("\n      }", start);
    expect(end).toBeGreaterThan(start);
    const zeroPagesBlock = handleSelectInstitutionBlock.slice(start, end);
    expect(zeroPagesBlock.includes("setKnowledgeContext(")).toBe(false);
    expect(zeroPagesBlock.includes("return;")).toBe(true);
  });

  it("the failure branch returns before ever calling setKnowledgeContext, and announces on the assertive channel (liveAlert), not the polite one", () => {
    const start = handleSelectInstitutionBlock.indexOf('if ("error" in result) {');
    expect(start).toBeGreaterThan(-1);
    const end = handleSelectInstitutionBlock.indexOf("\n      }", start);
    expect(end).toBeGreaterThan(start);
    const errorBlock = handleSelectInstitutionBlock.slice(start, end);
    expect(errorBlock.includes("setKnowledgeContext(")).toBe(false);
    expect(errorBlock.includes("setLiveAlert(")).toBe(true);
    expect(errorBlock.includes("return;")).toBe(true);
  });
});

describe("handleSelectInstitution guards the resolution race and never no-ops on a repeat selection (spec section 5/9)", () => {
  it("stamps a request-id token before the await and drops a stale result after it (two institutions picked in quick succession)", () => {
    expect(handleSelectInstitutionBlock.includes("++institutionRequestIdRef.current")).toBe(true);
    expect(
      /if \(requestId !== institutionRequestIdRef\.current\) return;/.test(handleSelectInstitutionBlock)
    ).toBe(true);
  });

  it("never short-circuits when the SAME institution is already loaded - re-selecting re-loads, it is not a no-op", () => {
    // A tempting-but-wrong optimization would guard the top of the function
    // with something like `if (code === knowledgeContext?.institution) return;`.
    // Pages may have changed since the first load, so this must never exist.
    expect(/if \(code === knowledgeContext\?\.institution\)/.test(handleSelectInstitutionBlock)).toBe(false);
  });
});

describe("Send is disabled with a stated reason while an institution is loading (spec section 9, copy item 6)", () => {
  it("sendBlockedReason is truthy only while institutionLoading is set, and passed through to AiChatWindow", () => {
    expect(source.includes("const sendBlockedReason = institutionLoading")).toBe(true);
    expect(source.includes("sendBlockedReason={sendBlockedReason}")).toBe(true);
  });
});
