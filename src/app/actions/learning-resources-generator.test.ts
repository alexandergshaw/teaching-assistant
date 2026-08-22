// A6-A10/D1 (docs/learning-resources-page-acceptance-criteria.md):
// generateLearningResourcesForSelection - shaped exactly like
// generateModuleObjectivesForAssignment (module-objectives.test.ts), whose
// mocking shape this file mirrors. The one property that matters most here
// (D1/A8): a model response containing URLs must come back with every one of
// them stripped, and a response that is nothing but links must surface as an
// error rather than an empty success.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { generateLearningResourcesForSelection } from "./learning-resources-generator";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

const okResponse = (text: string) => ({ ok: true, status: 200, body: "", text }) as never;

// A materials blob in the exact shape gatherSelectionMaterials
// (src/lib/lms-generation/materials.ts) produces: a markdown H1 per live
// Page/File item, an "export-sourced" item (or a live Assignment/Quiz/
// Discussion header-only line) as "Type: Title", each followed by its body
// text. The "Note: ..." line is a DECOY: it has the exact "Word: rest" shape
// but is body prose, not a real item header (materials.ts only ever emits
// "Type: Title" for Type in Assignment/Quiz/Page/File/Discussion) - finding 2
// is that the old, looser regex mistook lines shaped like this for a real
// selected item and told the student it was "one of the items selected for
// this module", which is false. The live page's own body text also carries a
// real URL, in the shape a live Page/File's body legitimately can (finding 4)
// - the embedded path must strip it, not copy it verbatim into a posted page.
const MATERIALS_TEXT = `# Stakeholder Register Assignment
Build a stakeholder register for your project, covering every party named in the charter.
Note: submissions are due Friday.
See https://pmi.org/stakeholder-register-guide for the official template.

Quiz: Stakeholder Analysis Check
Covers power-interest grids and engagement approaches.
`;

describe("generateLearningResourcesForSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A9: the embedded provider short-circuits to a deterministic scaffold
  // before any model call - never a silent failure, never a model call.
  it("embedded provider scaffolds deterministically and never calls the LLM", async () => {
    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "embedded");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.text).toContain("Learning Resources: Week 4");
    expect(callLlm).not.toHaveBeenCalled();
  });

  // A9/D1/finding 4: the embedded scaffold echoes the selection's own item
  // names back (drawn from the materials text's own headers) rather than
  // inventing new resources. MATERIALS_TEXT's live-page body contains a REAL
  // URL (https://pmi.org/stakeholder-register-guide, copied verbatim by
  // gatherSelectionMaterials from the item's own body) - so this assertion
  // has something to actually catch: the embedded branch returns before the
  // LLM path's stripModelUrls call, so without piping the scaffold's own
  // output through stripModelUrls too, this URL would reach the generated
  // page unfiltered. (Before this fix, MATERIALS_TEXT carried no URL at all,
  // so this assertion passed regardless of whether stripping happened.)
  it("embedded provider names the selected items and strips a URL carried in the materials body", async () => {
    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "embedded");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.text).toContain("Stakeholder Register Assignment");
    expect(result.text).toContain("Stakeholder Analysis Check");
    expect(result.text).not.toMatch(/https?:\/\//i);
    expect(result.text).not.toMatch(/www\./i);
    expect(result.text).not.toContain("pmi.org");
  });

  // Finding 2: a materials body line shaped exactly like a real item header
  // ("Word: rest") but that is NOT one (materials.ts only ever emits
  // "Type: Title" for Type in Assignment/Quiz/Page/File/Discussion - see
  // gatherLiveItem/gatherExportItem) must never be echoed back as something
  // the instructor selected. The old regex ([A-Za-z]+ before the colon)
  // matched "Note: submissions are due Friday." and told the student it was
  // "one of the items selected for this module" - a fabrication.
  it("does not present a materials body line shaped like 'Word: rest' as a selected item", async () => {
    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "embedded");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    const itemsSection = result.text.split("## This Module's Items")[1]?.split("## Concepts to Review")[0] ?? "";
    expect(itemsSection).toContain("Stakeholder Register Assignment");
    expect(itemsSection).toContain("Stakeholder Analysis Check");
    expect(itemsSection, "a decoy 'Note: ...' body line was fabricated into a selected item").not.toMatch(
      /submissions are due friday/i
    );
  });

  // Finding 3: the "Concepts to Review" section must say something different
  // from "This Module's Items" - toBullets' stripMarker (scaffold.ts:98-99)
  // strips "-"/"*"/bullet/"1."/"a)" but NOT a markdown "#", so without
  // filtering header lines out of the concepts source first, an item's own
  // "# Title" header line was picked up as a "concept" too, rendering as
  // "- # Stakeholder Register Assignment." - a leftover heading marker and a
  // line-for-line duplicate of the items section.
  it("the Concepts to Review section is not a duplicate of the Items section and carries no leftover heading marker", async () => {
    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "embedded");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    const itemsSection = result.text.split("## This Module's Items")[1]?.split("## Concepts to Review")[0] ?? "";
    const conceptsSection = result.text.split("## Concepts to Review")[1]?.split("## Practice")[0] ?? "";
    expect(conceptsSection.trim()).not.toBe(itemsSection.trim());
    expect(conceptsSection, "a concept line still carries a leftover '#' heading marker").not.toMatch(/^-\s*#/m);

    // THE BARE TITLE, NOT "title:" AND NOT THE "#" FORM. This fix has two
    // independent halves - stripItemHeaderLines (drop header lines from the
    // concepts source) and stripLeadingHeadingMarker (strip a leftover "#") -
    // and a regression pass found that the assertions above discriminate only
    // the SECOND. With the marker-stripping still in place, removing the
    // header filtering alone yields a concept line reading
    // "- Stakeholder Register Assignment." : no "#", no colon, not identical
    // to the items section, so every other assertion here passed while the
    // scaffold visibly fabricated an item title into the concepts list.
    // Asserting the bare title's absence is what actually catches that half,
    // and it is sound because an item's title only ever appears in the
    // materials text on its own header line - the very line the filter drops.
    expect(conceptsSection, "an item title leaked into the concepts list - the header filter is not working").not.toContain(
      "Stakeholder Register Assignment"
    );
    expect(conceptsSection, "an item title leaked into the concepts list - the header filter is not working").not.toContain(
      "Stakeholder Analysis Check"
    );
  });

  // A6: grounded in the module label and the gathered materials text, the
  // same two inputs generateModuleObjectivesForAssignment grounds its own
  // prompt in.
  it("grounds the prompt in the module label and the gathered materials text", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("# Learning Resources: Week 4\n\nBody"));

    await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    const prompt = promptFromCall();
    expect(prompt).toContain("Week 4");
    expect(prompt).toContain("Stakeholder Register Assignment");
    expect(prompt).toContain("Stakeholder Analysis Check");
  });

  // A7: reuses the shared PLAIN_LANGUAGE_CONTRACT and courseKindContract
  // rather than re-writing them, and applies the applied/coding distinction
  // the same way every other generator does - and, per A7's explicit
  // instruction, never reaches for the Bloom contract, which has no meaning
  // for a resources page.
  it("carries the applied no-code contract for an applied course kind; not for coding", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(okResponse("x"))
      .mockResolvedValueOnce(okResponse("y"));

    await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini", "applied");
    await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini", "coding");

    const appliedPrompt = promptFromCall(0);
    const codingPrompt = promptFromCall(1);
    expect(appliedPrompt).toContain("NOT a programming course");
    expect(codingPrompt).not.toContain("NOT a programming course");
  });

  it("never mentions Bloom's Taxonomy - that contract is objectives-specific", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("x"));

    await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect(promptFromCall()).not.toMatch(/\bBloom\b/i);
  });

  // D1/A7: the prompt states what a resource is allowed to be (drawn from
  // the selection, a concept, a practice suggestion, search terms) and
  // explicitly forbids inventing a link, chapter number, video title, or
  // author - pinning the FACT that all four categories are named, not the
  // exact prose used to say so.
  it("forbids inventing a URL, chapter number, video title, or author in the prompt", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("x"));

    await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    const prompt = promptFromCall();
    expect(prompt, "does not forbid inventing a link").toMatch(/never invent|do not invent|inventing a url/i);
    expect(prompt).toMatch(/chapter/i);
    expect(prompt).toMatch(/video/i);
    expect(prompt).toMatch(/author/i);
    expect(prompt, "does not ask for search terms as the linkless alternative").toMatch(/search terms?/i);
  });

  // A10: written for students, second person, no meta-commentary about being
  // an AI.
  it("asks for second-person, student-facing writing with no AI/meta commentary", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("x"));

    await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    const prompt = promptFromCall();
    expect(prompt).toMatch(/second person/i);
    expect(prompt).toMatch(/no commentary about being an ai/i);
  });

  it("returns an error when the LLM call fails, without throwing", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 503, body: "unavailable" } as never);

    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect("error" in result).toBe(true);
  });

  it("returns an error when the LLM returns an empty response", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("   "));

    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect("error" in result).toBe(true);
  });

  // D1/A8 - the property that matters most: a model response containing URLs
  // (both markdown-link and bare-URL shapes) comes back with every one of
  // them stripped, while the surrounding real content survives intact.
  it("strips every URL from a model response, in both markdown-link and bare-URL form", async () => {
    const withUrls = [
      "# Learning Resources: Week 4",
      "",
      "## This Module's Items",
      "- Stakeholder Register Assignment: see [the PMI guide](https://pmi.org/guide) before you start.",
      "",
      "## Concepts to Review",
      "- Power-interest grids, covered at www.example.com/grids in more depth.",
      "",
      "## Search Terms",
      '- "stakeholder power interest grid"',
    ].join("\n");
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse(withUrls));

    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.text).not.toMatch(/https?:\/\//i);
    expect(result.text).not.toMatch(/www\./i);
    // The surrounding real content survives - only the link itself is gone.
    expect(result.text).toContain("Stakeholder Register Assignment");
    expect(result.text).toContain("the PMI guide");
    expect(result.text).toContain("Power-interest grids");
    expect(result.text).toContain("stakeholder power interest grid");
  });

  // A8: when the model response is nothing but an invented link, stripping
  // it leaves nothing - that must be an error, never an empty success saved
  // and posted into a module.
  it("errors, rather than returning an empty success, when the response is nothing but a URL", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("https://example.com/fabricated-resource"));

    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect("error" in result).toBe(true);
  });
});
