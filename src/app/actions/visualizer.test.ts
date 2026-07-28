import { describe, it, expect, vi, beforeEach } from "vitest";

// extractDeckConceptsAction / createVisualizerConceptAction call requireOwner()
// (auth), callLlm() (network) and getFileText/putFile (GitHub REST) - all three
// are mocked so the pipeline logic itself (clamping, JSON parsing, the
// slide-title fallback, topic routing, component validation/retry, and the
// three-file commit) runs for real without hitting Supabase, Gemini, or
// GitHub. Pure-helper unit tests (clampDeckConcepts, parseDeckConcepts,
// conceptsFromSlideTitles) live in src/lib/workflows/deck-concepts.test.ts;
// insertNavLeaf/insertTopicPageCase/creatableTopics/topicByKey live in
// src/lib/visualizer.test.ts.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

vi.mock("@/lib/github", async () => {
  const actual = await vi.importActual<typeof import("@/lib/github")>("@/lib/github");
  return {
    ...actual,
    getFileText: vi.fn(),
    putFile: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { getFileText, putFile } from "@/lib/github";
import { extractDeckConceptsAction, createVisualizerConceptAction } from "./visualizer";

function llmPromptText(callIndex: number): string {
  const args = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = args.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

// A component that satisfies every check createVisualizerConceptAction's
// validation loop runs: export default function, ConceptWrapper present, no
// hardcoded hex color.
function validComponent(): string {
  return `import { ConceptWrapper, TableOfContents, Section, CalloutBox, CodeSnippet } from "components/common";

export default function Concept() {
  return (
    <ConceptWrapper title="t" description="d">
      <TableOfContents>
        <Section title="Big Idea"><CalloutBox>idea</CalloutBox></Section>
        <Section title="Code Walkthrough"><CodeSnippet code="x" /></Section>
        <Section title="Common Mistakes"><p>mistake</p></Section>
      </TableOfContents>
    </ConceptWrapper>
  );
}`;
}

describe("extractDeckConceptsAction", () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): clearAllMocks only clears call
    // history, not queued mockResolvedValueOnce/mockRejectedValueOnce
    // implementations - a test whose code throws before consuming every
    // value it queued would otherwise leak the leftover queued value into
    // whichever test runs next. resetAllMocks clears the queue too.
    vi.resetAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("returns an error for an empty/whitespace-only deck without calling the LLM", async () => {
    const result = await extractDeckConceptsAction("   ", 8, "gemini");
    expect(result).toEqual({ error: "Provide a slide deck to analyze." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("provider embedded derives concepts from slide titles (both forms) without calling the LLM", async () => {
    const deck = "## For Loops\nsome body text\n\nSlide 3: List Comprehension\nmore body text";
    const result = await extractDeckConceptsAction(deck, 8, "embedded");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.concepts.map((c) => c.concept)).toEqual(["For Loops", "List Comprehension"]);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("happy path: returns the model's parsed concepts in order", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        concepts: [
          { concept: "for loops", evidence: "Slide 2: For Loops" },
          { concept: "list comprehension", evidence: "Slide 5: List Comprehension" },
        ],
      }),
    });

    const result = await extractDeckConceptsAction(
      "Slide 2: For Loops\nSlide 5: List Comprehension",
      8,
      "gemini"
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.concepts).toEqual([
      { concept: "for loops", evidence: "Slide 2: For Loops" },
      { concept: "list comprehension", evidence: "Slide 5: List Comprehension" },
    ]);
  });

  it("caps the returned concepts at maxConcepts even when the model returns more", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        concepts: Array.from({ length: 6 }, (_, i) => ({ concept: `concept ${i}`, evidence: `e${i}` })),
      }),
    });

    const result = await extractDeckConceptsAction("deck text", 3, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.concepts).toHaveLength(3);
  });

  // clampDeckConcepts (src/lib/workflows/deck-concepts.ts) clamps to [1, 20]
  // with a default of 8 - a caller-supplied value above 20 or at/below 0 must
  // still land inside that range instead of being trusted as-is. Kept as two
  // independent tests (rather than two sequential calls in one test) so each
  // one's queued mock is scoped to itself, not to a shared multi-call test.
  it("clamps a caller value above the max (999) down to 20", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        concepts: Array.from({ length: 25 }, (_, i) => ({ concept: `concept ${i}`, evidence: "e" })),
      }),
    });

    const over = await extractDeckConceptsAction("deck text", 999, "gemini");
    expect("error" in over).toBe(false);
    if (!("error" in over)) expect(over.concepts).toHaveLength(20);
  });

  it("clamps a caller value of 0 up to the min (1)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        concepts: Array.from({ length: 5 }, (_, i) => ({ concept: `concept ${i}`, evidence: "e" })),
      }),
    });

    const zero = await extractDeckConceptsAction("deck text", 0, "gemini");
    expect("error" in zero).toBe(false);
    if (!("error" in zero)) expect(zero.concepts).toHaveLength(1);
  });

  it("falls back to slide-title concepts when the model's response parses to zero concepts", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ concepts: [] }) });
    const deck = "## For Loops\nSlide 2: While Loops";
    const result = await extractDeckConceptsAction(deck, 8, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.concepts.map((c) => c.concept)).toEqual(["For Loops", "While Loops"]);
  });

  it("errors when the model returns nothing usable and the deck has no recognizable slide titles", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ concepts: [] }) });
    const result = await extractDeckConceptsAction("just some prose, no slide markers at all", 8, "gemini");
    expect(result).toEqual({ error: "Could not find any teachable concepts in this deck." });
  });

  it("a failed LLM call does not throw - falls back to slide titles when present, else errors", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "server error" });
    const withTitles = await extractDeckConceptsAction("Slide 1: Recursion", 8, "gemini");
    expect("error" in withTitles).toBe(false);
    if (!("error" in withTitles)) {
      expect(withTitles.concepts.map((c) => c.concept)).toEqual(["Recursion"]);
    }

    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "server error" });
    const withoutTitles = await extractDeckConceptsAction("no titles here at all", 8, "gemini");
    expect(withoutTitles).toEqual({ error: "Could not find any teachable concepts in this deck." });
  });

  // DECK_TEXT_CHAR_CAP in src/app/actions/visualizer.ts is a private (not
  // exported) constant, read from source as 12000.
  it("caps the deck text sent to the model at the module's 12000-character limit", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ concepts: [{ concept: "x", evidence: "y" }] }),
    });
    const CAP = 12000;
    const deck = "A".repeat(CAP) + "OVERFLOW_MARKER" + "B".repeat(500);

    await extractDeckConceptsAction(deck, 8, "gemini");

    const prompt = llmPromptText(0);
    expect(prompt).not.toContain("OVERFLOW_MARKER");
    const marker = "SLIDE DECK:\n";
    const sliceStart = prompt.indexOf(marker) + marker.length;
    expect(prompt.length - sliceStart).toBe(CAP);
  });

  it("a requireOwner rejection yields an error result, not a thrown exception", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("not signed in"));
    const result = await extractDeckConceptsAction("some deck text", 8, "gemini");
    expect(result).toEqual({ error: "not signed in" });
  });
});

describe("createVisualizerConceptAction - topic routing", () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): clearAllMocks only clears call
    // history, not queued mockResolvedValueOnce/mockRejectedValueOnce
    // implementations - a test whose code throws before consuming every
    // value it queued would otherwise leak the leftover queued value into
    // whichever test runs next. resetAllMocks clears the queue too.
    vi.resetAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("the topic-selection prompt lists only creatable topics, excluding the five UnderConstruction stubs", async () => {
    // Topic pick fails - short-circuits right after the prompt is built, so
    // the prompt itself is all we need to inspect.
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "fail" });
    await createVisualizerConceptAction("recursion", "", "gemini");

    const prompt = llmPromptText(0);
    expect(prompt).toContain("python");
    expect(prompt).toContain("sql");
    expect(prompt).not.toContain("html");
    expect(prompt).not.toContain("php");
    expect(prompt).not.toContain("typescript");
    expect(prompt).not.toContain("deploying-a-website");
    expect(prompt).not.toContain("github");
  });

  it("a non-creatable topic pick (typescript) falls back to programming-basics, committed to its real paths", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({ ok: true, text: "typescript" }) // topic pick - not creatable
      .mockResolvedValueOnce({ ok: true, text: validComponent() }); // component generation

    vi.mocked(getFileText)
      .mockResolvedValueOnce(`export const programmingBasicsNavItems: SidebarItem[] = [];\n`)
      .mockResolvedValueOnce(
        `import ExistingConcept from "./ExistingConcept";

export default function ProgrammingBasicsPage({ concept }: { concept: string }) {
  switch (concept) {
    case "existing":
      return <ExistingConcept />;
    default:
      return null;
  }
}
`
      );
    vi.mocked(putFile).mockResolvedValue(undefined);

    const result = await createVisualizerConceptAction("Recursion", "", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.topic).toBe("programming-basics");

    const calls = vi.mocked(putFile).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][2]).toBe("components/pageComponents/ProgrammingBasics/RecursionConcept.tsx");
    expect(calls[1][2]).toBe("components/pageComponents/ProgrammingBasics/ProgrammingBasicsPage.tsx");
    expect(calls[2][2]).toBe("components/pageComponents/navItems.ts");
  });

  // Regression test for the real defect this feature fixed: the page
  // actually rendered at /languages/sql is the TOP-LEVEL SqlPage.tsx (there
  // is no SQL/SQLPage.tsx), and it imports concept components from "./SQL/",
  // not "./".
  it("SQL routing: commits to SqlPage.tsx (not SQL/SQLPage.tsx) with a ./SQL/ import", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({ ok: true, text: "sql" }) // topic pick
      .mockResolvedValueOnce({ ok: true, text: validComponent() }); // component generation

    vi.mocked(getFileText)
      .mockResolvedValueOnce(`export const sqlNavItems: SidebarItem[] = [];\n`)
      .mockResolvedValueOnce(
        `import SelectConcept from "./SQL/SelectConcept";

export default function SqlPage({ concept }: { concept: string }) {
  switch (concept) {
    case "select":
      return <SelectConcept />;
    default:
      return null;
  }
}
`
      );
    vi.mocked(putFile).mockResolvedValue(undefined);

    const result = await createVisualizerConceptAction("Joins", "context", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.topic).toBe("sql");

    const calls = vi.mocked(putFile).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][2]).toBe("components/pageComponents/SQL/JoinsConcept.tsx");
    expect(calls[1][2]).toBe("components/pageComponents/SqlPage.tsx");
    expect(calls[2][2]).toBe("components/pageComponents/navItems.ts");
    expect(calls[1][3]).toContain('from "./SQL/JoinsConcept"');
  });

  it("provider embedded returns the exact refusal message and commits nothing", async () => {
    const result = await createVisualizerConceptAction("Recursion", "", "embedded");
    expect(result).toEqual({ error: "Creating visualizer pages requires an LLM provider." });
    expect(callLlm).not.toHaveBeenCalled();
    expect(putFile).not.toHaveBeenCalled();
  });

  it("a generated component with a hardcoded hex color is rejected after the retry", async () => {
    const hexComponent = `import { ConceptWrapper } from "components/common";
export default function Concept() {
  return <ConceptWrapper style={{ color: "#ff0000" }} />;
}`;
    vi.mocked(callLlm)
      .mockResolvedValueOnce({ ok: true, text: "python" }) // topic pick
      .mockResolvedValueOnce({ ok: true, text: hexComponent }) // initial generation
      .mockResolvedValueOnce({ ok: true, text: hexComponent }); // retry - still bad

    const result = await createVisualizerConceptAction("Recursion", "", "gemini");
    expect(result).toEqual({ error: "Generated component contains hardcoded colors. Please regenerate." });
    expect(callLlm).toHaveBeenCalledTimes(3);
    expect(putFile).not.toHaveBeenCalled();
  });

  it("a generated component missing 'export default function' is rejected after the retry", async () => {
    const badComponent = `import { ConceptWrapper } from "components/common";
const Concept = () => <ConceptWrapper />;
export default Concept;`;
    vi.mocked(callLlm)
      .mockResolvedValueOnce({ ok: true, text: "python" }) // topic pick
      .mockResolvedValueOnce({ ok: true, text: badComponent }) // initial generation
      .mockResolvedValueOnce({ ok: true, text: badComponent }); // retry - still bad

    const result = await createVisualizerConceptAction("Recursion", "", "gemini");
    expect(result).toEqual({ error: "Generated component is invalid. Missing required structure." });
    expect(putFile).not.toHaveBeenCalled();
  });
});
