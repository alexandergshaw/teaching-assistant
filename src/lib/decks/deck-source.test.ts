import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeDeckSource, deriveSubjectFromSource, DECK_SOURCE_MAX_CHARS } from "./deck-source";
import { buildDeckPrompt, type DeckGenContext } from "./generate";
import { emptyDeckTemplate, expandTemplate, type DeckTemplate } from "./types";

describe("normalizeDeckSource", () => {
  it("keeps short text untouched and reports no truncation", () => {
    const { materials, receipt } = normalizeDeckSource("notes.txt", 42, "Chapter 3: Loops\n\nA loop repeats.");
    expect(materials).toBe("Chapter 3: Loops\n\nA loop repeats.");
    expect(receipt).toEqual({
      name: "notes.txt",
      bytes: 42,
      characters: materials.length,
      truncated: false,
    });
  });

  it("collapses runs of blank lines so the budget is spent on content", () => {
    const { materials } = normalizeDeckSource("x.md", 10, "A\n\n\n\n\nB");
    expect(materials).toBe("A\n\nB");
  });

  it("truncates text past DECK_SOURCE_MAX_CHARS and marks the receipt truncated", () => {
    const long = "x".repeat(DECK_SOURCE_MAX_CHARS + 500);
    const { materials, receipt } = normalizeDeckSource("big.txt", 999999, long);
    expect(materials.length).toBeLessThanOrEqual(DECK_SOURCE_MAX_CHARS);
    expect(receipt.truncated).toBe(true);
    expect(receipt.characters).toBe(materials.length);
  });

  it("an empty source normalises to an empty materials string, not truncated", () => {
    const { materials, receipt } = normalizeDeckSource("empty.txt", 0, "   \n\n  ");
    expect(materials).toBe("");
    expect(receipt.truncated).toBe(false);
    expect(receipt.characters).toBe(0);
  });
});

describe("deriveSubjectFromSource", () => {
  it("prefers the source's first Markdown heading", () => {
    expect(deriveSubjectFromSource("chapter3.pdf", "# Recursion Basics\n\nBody text.")).toBe(
      "Recursion Basics"
    );
  });

  it("falls back to the first non-empty line when there is no heading marker", () => {
    expect(deriveSubjectFromSource("notes.txt", "Binary Search Trees\nSome body text.")).toBe(
      "Binary Search Trees"
    );
  });

  it("falls back to the filename (extension stripped) when materials is empty", () => {
    expect(deriveSubjectFromSource("week4-hashing.docx", "")).toBe("week4-hashing");
  });
});

// THE REACHABILITY ASSERTION (per the A43-S brief): the whole point of this
// row is that a source the instructor supplies must actually reach the
// generator's prompt, not merely populate a piece of UI state. This proves
// the data-flow half of that end to end - normalizeDeckSource's own output,
// fed into DeckGenContext.materials exactly as
// src/app/components/ppt-design/index.tsx wires it, must surface in
// buildDeckPrompt's output under the SOURCE MATERIALS heading
// (src/lib/decks/generate.ts:114). Before this file/deck-source.ts existed,
// there was no `materials` key in that ctx at all (docs/a43-scope.md
// section 2.2's "THE GAP") - so this assertion is exactly the one that was
// unreachable.
describe("A43-S reachability: a normalised source reaches buildDeckPrompt's SOURCE MATERIALS block", () => {
  const template: DeckTemplate = emptyDeckTemplate("Untitled deck");
  const resolved = expandTemplate(template, {});

  it("materials text produced by normalizeDeckSource appears verbatim in the prompt", () => {
    const { materials } = normalizeDeckSource(
      "chapter3.pdf",
      1234,
      "# Recursion Basics\n\nA function that calls itself is recursive."
    );
    expect(materials.length).toBeGreaterThan(0);

    const ctx: DeckGenContext = {
      subject: "Recursion",
      materials,
      loopItems: {},
    };

    const prompt = buildDeckPrompt(template, resolved, ctx);
    expect(prompt).toContain("SOURCE MATERIALS:");
    expect(prompt).toContain(materials);
  });

  it("no SOURCE MATERIALS block appears when materials is absent (the pre-A43-S shape)", () => {
    const ctx: DeckGenContext = {
      subject: "Recursion",
      loopItems: {},
    };
    const prompt = buildDeckPrompt(template, resolved, ctx);
    expect(prompt).not.toContain("SOURCE MATERIALS:");
  });
});

// THE OTHER HALF of reachability: nothing renders under vitest
// (docs/loop/this-repo.md), so index.tsx's handleGenerateDeck cannot be
// exercised directly here. This is the repo's own source-reading wiring
// idiom (see src/app/components/grading-results/gradingResultsHelpersWiring.test.ts)
// applied to the one line that was the defect: index.tsx's `ctx` literal at
// (today) :341-344 builds `{ subject, audience, loopItems }` with no
// `materials` key at all, so a source the instructor supplies can never
// reach generateDeckFromTemplateAction -> buildDeckPrompt no matter what the
// pure module above does. Pinned on the FACT (a materials key is present and
// is not a bare empty-string literal), never on exact spelling/formatting.
describe("A43-S reachability: ppt-design/index.tsx actually threads materials into ctx", () => {
  function readStrippedSource(relativeToThisFile: string): string {
    return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  // Matches a `materials:` property in the ctx object and captures its value
  // expression.
  const MATERIALS_KEY_PATTERN = /materials\s*:\s*([^,}]+)/;
  // An empty-string literal (with or without surrounding whitespace) - the
  // shape that would ship the key present but permanently dead.
  const EMPTY_STRING_LITERAL_PATTERN = /^["'`]\s*["'`]$/;

  function hasRealMaterialsBinding(source: string): boolean {
    const match = source.match(MATERIALS_KEY_PATTERN);
    if (!match) return false;
    const value = match[1].trim();
    return value.length > 0 && !EMPTY_STRING_LITERAL_PATTERN.test(value);
  }

  it("canary: a real, non-empty materials binding is detected", () => {
    expect(hasRealMaterialsBinding("const ctx = { subject, materials: sourceMaterials, loopItems };")).toBe(
      true
    );
  });

  it("canary: a hardcoded empty-string materials binding is NOT detected (would ship the key dead)", () => {
    expect(hasRealMaterialsBinding('const ctx = { subject, materials: "", loopItems };')).toBe(false);
  });

  it("canary: no materials key at all is NOT detected (today's shape)", () => {
    expect(hasRealMaterialsBinding("const ctx = { subject, audience, loopItems };")).toBe(false);
  });

  it("index.tsx's handleGenerateDeck ctx literal carries a real materials binding", () => {
    const source = readStrippedSource("../../app/components/ppt-design/index.tsx");
    const ctxLiteralMatch = source.match(/const ctx[^=]*=\s*\{[\s\S]*?\};/);
    expect(ctxLiteralMatch).not.toBeNull();
    expect(hasRealMaterialsBinding(ctxLiteralMatch![0])).toBe(true);
  });
});
