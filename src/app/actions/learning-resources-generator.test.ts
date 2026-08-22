// A6-A10/D1 (docs/learning-resources-page-acceptance-criteria.md) plus the
// real-links revision (docs/learning-resources-real-links-acceptance-
// criteria.md, Contract 3): generateLearningResourcesForSelection - shaped
// exactly like generateModuleObjectivesForAssignment (module-
// objectives.test.ts), whose mocking shape this file mirrors.
//
// TWO PROPERTIES MATTER MOST HERE NOW:
//   1. (unchanged, D1/A8) a model response containing URLs must come back
//      with every one of them stripped, and a response that is nothing but
//      links must surface as an error rather than an empty success.
//   2. (new, D4/D7t) that stripping must apply ONLY to the prose - a link
//      that survived the sibling action's three gates (grounded search,
//      corroboration, reachability) must reach the page intact in the
//      appended Resources section, never stripped back out.
//
// The sibling grounded-link-finder action (findResourceLinksForConceptsAction,
// @/app/actions/learning-resource-links) is mocked as a whole function here,
// the same way callLlm is - this file tests ONLY what
// generateLearningResourcesForSelection itself does with that sibling's
// result (deriving concepts, calling it, rendering what comes back), never
// re-tests the sibling's own grounding/corroboration/reachability logic
// (that belongs to that file's own test file).
//
// CALL-COUNT NOTE: on the non-embedded path, a successful, non-empty prose
// response is now followed by a SECOND, separate callLlm call (concept
// derivation, deriveResourceConcepts) before the sibling action is ever
// reached. Every test below that queues callLlm responses across MULTIPLE
// invocations must queue one response per callLlm call, not one per
// invocation - see "carries the applied no-code contract" for a test that
// actually spans two invocations.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

// The sibling action this generator now calls (Contract 2). Mocked as a
// whole function - its own grounding/corroboration/reachability behavior is
// out of scope here (that belongs to learning-resource-links.test.ts); this
// file only tests what the generator does with whatever the sibling returns.
vi.mock("@/app/actions/learning-resource-links", () => ({
  findResourceLinksForConceptsAction: vi.fn(),
}));

import { callLlm } from "@/lib/llm";
// The REAL inline tokenizer markdownLiteToHtml uses (src/lib/docx-blocks.ts)
// - imported rather than reproduced, so the bracket test below proves the
// emitted line actually parses into one intact link, not that a regex
// written here happens to agree with the one that ships.
import { tokenizeInline } from "@/lib/docx-blocks";
import { findResourceLinksForConceptsAction, type FindResourceLinksSuccess } from "@/app/actions/learning-resource-links";
import { generateLearningResourcesForSelection } from "./learning-resources-generator";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

const okResponse = (text: string) => ({ ok: true, status: 200, body: "", text }) as never;

/** A concept-extraction response in the exact shape deriveResourceConcepts
 * expects (parsed via parseDeckConcepts): {"concepts":[{"concept":"...",
 * "evidence":"..."}]}. Used as the SECOND queued callLlm response whenever a
 * test needs specific, named concepts to flow into the sibling action call. */
function conceptsResponse(concepts: string[]) {
  return okResponse(
    JSON.stringify({
      concepts: concepts.map((concept) => ({ concept, evidence: "drawn from this module's materials" })),
    })
  );
}

/** A FindResourceLinksSuccess with every field defaulted to "found nothing,
 * dropped nothing" - callers override only what a given test cares about. */
function linksOutcome(overrides: Partial<FindResourceLinksSuccess> = {}): FindResourceLinksSuccess {
  return {
    links: [],
    degraded: false,
    droppedUncorroborated: 0,
    droppedPlaceholder: 0,
    droppedUnreachable: 0,
    notes: [],
    ...overrides,
  };
}

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
  // D5/C4 (real-links AC): and, now that a sibling action exists to call,
  // never calls IT either - the embedded provider can neither search nor
  // verify, so it must not reach for a feature that requires both.
  it("embedded provider scaffolds deterministically and never calls the LLM or the sibling link-finder", async () => {
    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "embedded");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.text).toContain("Learning Resources: Week 4");
    expect(callLlm).not.toHaveBeenCalled();
    expect(findResourceLinksForConceptsAction).not.toHaveBeenCalled();
  });

  // A9/D1/finding 4/D6t (real-links AC): the embedded scaffold echoes the
  // selection's own item names back (drawn from the materials text's own
  // headers) rather than inventing new resources. MATERIALS_TEXT's live-page
  // body contains a REAL URL (https://pmi.org/stakeholder-register-guide,
  // copied verbatim by gatherSelectionMaterials from the item's own body) -
  // so this assertion has something to actually catch: the embedded branch
  // returns before the LLM path's stripModelUrls call, so without piping the
  // scaffold's own output through stripModelUrls too, this URL would reach
  // the generated page unfiltered. This is exactly D6t's fixture requirement
  // (a URL-CONTAINING fixture, not a URL-free one that could never fail).
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
  // prompt in. Only the FIRST callLlm call (the prose call) matters here -
  // the second (concept derivation) hits an exhausted mock queue and
  // degrades to [] concepts (deriveResourceConcepts's own try/catch), which
  // never surfaces as a test failure.
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
  //
  // This test spans TWO invocations, each of which now issues TWO callLlm
  // calls (prose, then concept derivation) when the prose is non-empty - so
  // FOUR responses are queued, not two, or the second invocation's prose call
  // would consume the first invocation's leftover concept-derivation slot and
  // read someone else's response.
  it("carries the applied no-code contract for an applied course kind; not for coding", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(okResponse("x")) // applied: prose
      .mockResolvedValueOnce(conceptsResponse([])) // applied: concept derivation
      .mockResolvedValueOnce(okResponse("y")) // coding: prose
      .mockResolvedValueOnce(conceptsResponse([])); // coding: concept derivation

    await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini", "applied");
    await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini", "coding");

    const appliedPrompt = promptFromCall(0);
    const codingPrompt = promptFromCall(2);
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
    // Split off the appended Resources section - it is allowed to carry
    // real links (see the "resources list carries links" tests below); this
    // assertion is only about the PROSE the model itself wrote.
    const prose = result.text.split("## Resources")[0];
    expect(prose).not.toMatch(/https?:\/\//i);
    expect(prose).not.toMatch(/www\./i);
    // The surrounding real content survives - only the link itself is gone.
    expect(prose).toContain("Stakeholder Register Assignment");
    expect(prose).toContain("the PMI guide");
    expect(prose).toContain("Power-interest grids");
    expect(prose).toContain("stakeholder power interest grid");
  });

  // A8: when the model response is nothing but an invented link, stripping
  // it leaves nothing - that must be an error, never an empty success saved
  // and posted into a module.
  it("errors, rather than returning an empty success, when the response is nothing but a URL", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("https://example.com/fabricated-resource"));

    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect("error" in result).toBe(true);
  });

  // ── Real links (docs/learning-resources-real-links-acceptance-criteria.md) ─

  // D7t - THE REGRESSION THAT WOULD QUIETLY UNDO THE WHOLE ORIGINAL DEFENSE:
  // if the final text were built by concatenating prose + Resources and THEN
  // running stripModelUrls over the combined result (instead of stripping
  // the prose alone, before the Resources section is even built), every
  // link the sibling action verified would be deleted right back out again.
  // This test proves both halves at once: the prose's own invented URL is
  // gone, and the sibling-verified link survives.
  it("still strips prose URLs when the Resources section carries a real, corroborated link", async () => {
    const proseWithUrl = [
      "# Learning Resources: Week 4",
      "",
      "## Concepts to Review",
      "- Power-interest grids, covered at www.example.com/grids in more depth.",
    ].join("\n");
    vi.mocked(callLlm)
      .mockResolvedValueOnce(okResponse(proseWithUrl))
      .mockResolvedValueOnce(conceptsResponse(["Power-interest grids"]));
    vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce(
      linksOutcome({
        links: [
          {
            concept: "Power-interest grids",
            title: "PMI Stakeholder Guide",
            url: "https://pmi.org/stakeholder-register-guide",
            kind: "doc",
            whatYouGet: "A worked example of a power-interest grid.",
          },
        ],
      })
    );

    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    const [prose, resources] = [result.text.split("## Resources")[0], result.text.split("## Resources")[1] ?? ""];

    // The model's own invented link is gone from the prose...
    expect(prose).not.toMatch(/www\.example\.com/i);
    // ...but the sibling-verified link survives, intact, as a real markdown
    // link (so markdownLiteToHtml can turn it into an anchor - C1).
    expect(resources).toContain("[PMI Stakeholder Guide](https://pmi.org/stakeholder-register-guide)");
    expect(resources).toContain("Power-interest grids");
  });

  // "A degraded result (sibling returns degraded true) produces a page with
  // no links but still a useful page." Mirrors current-events.test.ts's own
  // degraded-mode assertions (B2 of the AC doc): the page must not error out,
  // must carry the sibling's own note verbatim (C5), must still list every
  // concept (C3), and must carry zero links.
  it("renders a useful, linkless page when the sibling action reports degraded (no sources at all)", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(okResponse("# Learning Resources: Week 4\n\nSome real prose body."))
      .mockResolvedValueOnce(conceptsResponse(["Power-interest grids", "Stakeholder engagement"]));
    vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce(
      linksOutcome({
        degraded: true,
        notes: ["No web sources were returned for any concept - the model answered without searching, so no links can be shown."],
      })
    );

    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.text).toContain("Some real prose body.");
    expect(result.text).not.toMatch(/https?:\/\//i);
    // Every concept the run searched for is still listed (C3) - degraded
    // mode must not make the concepts vanish along with the links.
    expect(result.text).toContain("Power-interest grids");
    expect(result.text).toContain("Stakeholder engagement");
    // The sibling's own note is surfaced verbatim (C5), not paraphrased or
    // dropped - it's the only way an instructor learns WHY there are no links.
    expect(result.text).toContain(
      "No web sources were returned for any concept - the model answered without searching, so no links can be shown."
    );
  });

  // "A concept whose links were all dropped still appears with its non-link
  // content" (C3). Two concepts are searched; only one comes back with a
  // surviving link. The other must still be listed on the page, not silently
  // omitted just because search/corroboration/reachability found nothing for it.
  it("still lists a concept whose candidate links were all dropped, alongside one that kept a link", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(okResponse("# Learning Resources: Week 4\n\nSome real prose body."))
      .mockResolvedValueOnce(conceptsResponse(["Concept With A Link", "Concept With No Surviving Link"]));
    vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce(
      linksOutcome({
        links: [
          {
            concept: "Concept With A Link",
            title: "Official Docs",
            url: "https://example.org/official-docs",
            kind: "doc",
            whatYouGet: "The canonical reference.",
          },
        ],
        droppedUncorroborated: 1,
      })
    );

    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    const withLinkGroup = result.text.split("### Concept With A Link")[1]?.split("###")[0] ?? "";
    const noLinkGroup = result.text.split("### Concept With No Surviving Link")[1] ?? "";

    expect(withLinkGroup).toContain("[Official Docs](https://example.org/official-docs)");
    // The concept with nothing surviving is still present, on the page, with
    // no link attached to it - not omitted (C3).
    expect(noLinkGroup).toContain("Concept With No Surviving Link");
    expect(noLinkGroup, "a concept with no surviving link must not silently get someone else's link").not.toMatch(
      /https?:\/\//i
    );
    // C5: the instructor-facing counts reflect what was dropped and why.
    expect(result.text).toMatch(/1 link\(s\) kept/);
    expect(result.text).toMatch(/uncorroborated: 1/);
  });

  // BLOCKER fix (this file's own): `link.url` is the ONLY field on
  // ResourceLink that passed the sibling action's three gates (grounded
  // search, corroboration, reachability). `concept.concept` (from
  // deriveResourceConcepts, an ungrounded callLlm over materialsText with no
  // URL filter of any kind), `link.title` and `link.whatYouGet` (from the
  // sibling's own SECOND, ungrounded structuring call), and every `note` the
  // sibling returns are all ungated, model-authored strings that could carry
  // a bare URL - and markdownLiteToHtml's autolinker would turn a surviving
  // one into a real, unverified, clickable anchor (src/lib/urls.ts:8-11's 37
  // dead links out of 73). This plants a distinguishable bare URL in all
  // four of those fields at once and asserts none of them reach the page,
  // while the gated `link.url` - in the very same render - survives intact.
  // Verified able to fail: before the fix, buildResourcesSection rendered
  // `concept.concept` and each `note` verbatim, and resourceLinkBullet
  // rendered `title`/`whatYouGet` verbatim, so "evil.example.com" reached
  // `result.text` in all four spots.
  it("strips a bare URL planted in the concept name, link title, whatYouGet, or a note, while the gated link.url survives intact", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(okResponse("# Learning Resources: Week 4\n\nSome real prose body."))
      .mockResolvedValueOnce(conceptsResponse(["Stakeholder register https://evil.example.com/fake-concept"]));
    vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce(
      linksOutcome({
        links: [
          {
            concept: "Stakeholder register https://evil.example.com/fake-concept",
            title: "PMI Guide https://evil.example.com/fake-title",
            url: "https://pmi.org/stakeholder-register-guide",
            kind: "doc",
            whatYouGet: "Covers registers - see https://evil.example.com/fake-whatyouget for more.",
          },
        ],
        notes: ["See https://evil.example.com/fake-note for background."],
      })
    );

    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.text, "a model-authored URL reached the rendered page unstripped").not.toContain("evil.example.com");
    // The gated link.url - the one field allowed to carry a link - survives,
    // unmodified, in the very same render.
    expect(result.text).toContain("https://pmi.org/stakeholder-register-guide");
  });

  // The LINK-TEXT half of the same class of defect, found by a regression
  // pass. A title containing "[" or "]" terminates the "[...]" of its own
  // markdown link early, so the href is lost and tokenizeInline autolinks
  // the bare URL instead, leaving stray brackets in the sentence. Unlike the
  // balanced-paren defect on the URL side this degrades to a WORKING bare
  // link rather than a dead one, which is exactly why nothing caught it.
  //
  // Asserted against the REAL tokenizer markdownLiteToHtml uses, not against
  // a regex reproduced here: the point is that the emitted line parses into
  // one link token whose href is the whole URL, which is the property a
  // student actually depends on.
  it("a link title containing square brackets still produces one intact markdown link", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(okResponse("# Learning Resources: Week 4\n\nSome real prose body."))
      .mockResolvedValueOnce(conceptsResponse(["Stakeholder register"]));
    vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce(
      linksOutcome({
        links: [
          {
            concept: "Stakeholder register",
            // NOT "[v2] (official)": a bracket group followed by a paren
            // group is itself markdown-link-shaped, so stripModelUrls'
            // MARKDOWN_LINK_RE collapses it and the brackets disappear for
            // an unrelated reason - which made an earlier version of this
            // test pass even with the bracket-stripping reverted. The
            // fixture has to carry brackets that survive stripModelUrls
            // untouched, or it proves nothing.
            title: "PMI Guide [v2] reference",
            url: "https://pmi.org/stakeholder-register-guide",
            kind: "doc",
            whatYouGet: "Covers registers end to end.",
          },
        ],
      })
    );

    const result = await generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const bullet = result.text
      .split("\n")
      .find((line) => line.includes("pmi.org/stakeholder-register-guide"));
    expect(bullet, "the link bullet was never rendered").toBeDefined();

    const linkTokens = tokenizeInline(bullet!).filter((t) => t.kind === "link");
    expect(linkTokens).toHaveLength(1);
    expect(linkTokens[0].url).toBe("https://pmi.org/stakeholder-register-guide");

    // THE ASSERTION THAT ACTUALLY CATCHES THIS. The href survives a
    // bracketed title either way, which is why an earlier version of this
    // test passed with the fix reverted: when `[...]` fails to match,
    // INLINE_LINK_RE's SECOND branch (docx-blocks.ts:84-85) autolinks the
    // bare URL instead, producing one link token with the correct target.
    // What breaks is the DISPLAY: the student sees the raw URL as the link
    // text with stray "[", "]" and ")" scattered around it, instead of the
    // resource's title. So the property worth pinning is that the link
    // displays the TITLE, never the URL.
    expect(linkTokens[0].text, "the bracketed title fell back to a bare autolink").not.toBe(
      "https://pmi.org/stakeholder-register-guide"
    );
    expect(linkTokens[0].text).toContain("PMI Guide");
  });

  // Budget fix (D6, docs/learning-resources-real-links-acceptance-criteria.md):
  // the prose call and deriveResourceConcepts must be kicked off together
  // (Promise.all), not one awaited before the other begins - both take only
  // materialsText and neither needs the other's result. Proven by holding
  // BOTH callLlm responses pending and asserting callLlm has already been
  // invoked twice - which is only possible if the second call (inside
  // deriveResourceConcepts) was issued before the first one's promise ever
  // settled. Verified able to fail: reverting to the prior sequential
  // `await callLlm(...)` (prose) followed later by `await
  // deriveResourceConcepts(...)` leaves the second callLlm invocation
  // blocked on the first's unresolved promise, so `toHaveBeenCalledTimes(2)`
  // observes 1, not 2, at the checkpoint below.
  it("pins that the prose call and concept derivation are started concurrently, not one after the other", async () => {
    let resolveProse!: (value: unknown) => void;
    let resolveConcepts!: (value: unknown) => void;
    const prosePromise = new Promise((resolve) => {
      resolveProse = resolve;
    });
    const conceptsPromise = new Promise((resolve) => {
      resolveConcepts = resolve;
    });

    vi.mocked(callLlm)
      .mockImplementationOnce(() => prosePromise as never)
      .mockImplementationOnce(() => conceptsPromise as never);

    const resultPromise = generateLearningResourcesForSelection("Week 4", MATERIALS_TEXT, "gemini");

    // Neither promise has settled yet - if the two calls were sequential,
    // only the first (prose) call could have been issued by this point.
    expect(callLlm).toHaveBeenCalledTimes(2);

    resolveConcepts(conceptsResponse([]));
    resolveProse(okResponse("# Learning Resources: Week 4\n\nSome real prose body."));

    const result = await resultPromise;
    expect("error" in result).toBe(false);
  });
});
