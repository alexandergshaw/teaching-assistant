import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors src/app/api/lms-generation/deck/route.test.ts's own mocking
// approach (read in full before this file was written): every collaborator
// mocked at the EXACT specifier route.ts imports it from, so an inert mock
// fails loudly rather than silently falling through to a real
// implementation.
//
// NOT mocked, per the same precedent's "pure leaves are imported for real"
// rule:
//   - @/lib/visualizer (matchConcept) - an existing, pure, dependency-free
//     module.
//   - @/lib/visualizer/selection-coverage - the pure leaf that owns
//     VISUALIZER_CREATE_MAX_PAGES and this route's own wire-contract types.
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/app/actions/live-class", () => ({ loadVisualizerIndexAction: vi.fn() }));
vi.mock("@/app/actions/visualizer", () => ({ createVisualizerConceptAction: vi.fn() }));

import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/supabase/auth";
import { loadVisualizerIndexAction } from "@/app/actions/live-class";
import { createVisualizerConceptAction } from "@/app/actions/visualizer";
import { VISUALIZER_CREATE_MAX_PAGES, type GapConcept } from "@/lib/visualizer/selection-coverage";
import { POST, runtime, maxDuration } from "./route";
import fs from "fs";
import path from "path";

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

async function readJson(res: Response) {
  return res.json();
}

function gap(concept: string, reason: GapConcept["reason"] = "no-match", evidence = `${concept} evidence`): GapConcept {
  return { concept, evidence, reason };
}

// Real navItems shapes (parseNavItems' output, mirrored from
// visualizer-selection.test.ts's own INDEX_ENTRIES) - "For Loops" already
// resolves against this fixture, which is what B4's re-check test below
// depends on.
const INDEX_ENTRIES = [{ topicExport: "pythonNavItems", label: "For Loops", value: "for-loops" }];

function mockOwner() {
  vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "owner@example.com" } as never);
}
function mockIndex(entries: typeof INDEX_ENTRIES = []) {
  vi.mocked(loadVisualizerIndexAction).mockResolvedValue({ entries } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOwner();
});

describe("POST /api/visualizer/create", () => {
  // TEST QUALITY fix: asserting only `toHaveBeenCalled()` would still pass if
  // requireOwner were called AFTER the creation loop (e.g. moved to just
  // before the response is built) - it says nothing about WHEN the call
  // happened relative to the actual work. This pins the ORDER: requireOwner
  // must resolve before createVisualizerConceptAction is ever invoked, via
  // vitest's own invocationCallOrder rather than a bare "was it called"
  // check. Verified to fail: moving the `await requireOwner()` call to
  // immediately before the `return NextResponse.json(...)` at the end of
  // POST (after the creation loop) makes createVisualizerConceptAction's
  // invocationCallOrder come first, flipping the comparison below.
  it("is owner-scoped - requireOwner resolves before any creation work starts, not merely at some point during the request", async () => {
    mockIndex([]);
    vi.mocked(createVisualizerConceptAction).mockResolvedValue({ url: "u", slug: "s", topic: "python" } as never);

    await POST(makeReq({ concepts: [gap("Quantum Foo")] }));

    expect(requireOwner).toHaveBeenCalled();
    expect(createVisualizerConceptAction).toHaveBeenCalled();
    const ownerOrder = vi.mocked(requireOwner).mock.invocationCallOrder[0];
    const createOrder = vi.mocked(createVisualizerConceptAction).mock.invocationCallOrder[0];
    expect(ownerOrder).toBeLessThan(createOrder);
  });

  it("refuses an empty concept list without loading the index", async () => {
    const res = await POST(makeReq({ concepts: [] }));
    const body = await readJson(res);

    expect("error" in body).toBe(true);
    expect(loadVisualizerIndexAction).not.toHaveBeenCalled();
  });

  it("refuses a missing concepts field the same way as an empty array", async () => {
    const res = await POST(makeReq({}));
    const body = await readJson(res);

    expect("error" in body).toBe(true);
    expect(loadVisualizerIndexAction).not.toHaveBeenCalled();
  });

  // FINDING 9: `reason` arrives in the POST body and is caller-controlled -
  // trusting it (the old behavior) means a hand-crafted payload can simply
  // claim "no-match" for a concept that actually already matches a
  // non-creatable topic in the real index. The route must re-derive
  // creatability itself (matchConcept + topic.creatable, the same inputs
  // classifySelectionCoverage uses) rather than reading the label. "Semantic
  // Tags" here resolves to the html topic, which VISUALIZER_TOPICS marks
  // creatable: false (one of the five UnderConstruction stubs).
  const NON_CREATABLE_INDEX_ENTRY = { topicExport: "htmlNavItems", label: "Semantic Tags", value: "semantic-tags" };

  it("FINDING 9: a gap that actually matches a non-creatable topic is excluded even when the payload lies and claims reason: no-match, mixed in with a real gap", async () => {
    mockIndex([NON_CREATABLE_INDEX_ENTRY]);
    vi.mocked(createVisualizerConceptAction).mockResolvedValue({ url: "u", slug: "s", topic: "python" } as never);

    const res = await POST(
      makeReq({ concepts: [gap("Semantic Tags", "no-match"), gap("Quantum Foo", "no-match")] })
    );
    const body = await readJson(res);

    expect(createVisualizerConceptAction).toHaveBeenCalledTimes(1);
    expect(createVisualizerConceptAction).toHaveBeenCalledWith("Quantum Foo", "Quantum Foo evidence", "gemini");
    expect(body).not.toEqual({ error: expect.any(String) });
    expect(body.created.some((c: { concept: string }) => c.concept === "Semantic Tags")).toBe(false);
    expect(body.skipped).not.toContain("Semantic Tags");
    expect(body.failed).toEqual([]);
  });

  // The EXACT payload the finding calls out, verbatim: a single concept,
  // empty evidence, and a `reason` that (falsely) claims "no-match" for a
  // concept that genuinely resolves to a non-creatable topic.
  it("FINDING 9 exact payload: {concept, evidence: '', reason: 'no-match'} for an actually non-creatable concept is refused", async () => {
    mockIndex([NON_CREATABLE_INDEX_ENTRY]);

    const res = await POST(
      makeReq({ concepts: [{ concept: "Semantic Tags", evidence: "", reason: "no-match" }] })
    );
    const body = await readJson(res);

    expect("error" in body).toBe(true);
    expect(createVisualizerConceptAction).not.toHaveBeenCalled();
  });

  it("refuses when every gap resolves to a non-creatable topic in the real index - the index IS loaded to verify this, `reason` is never trusted on its own", async () => {
    mockIndex([NON_CREATABLE_INDEX_ENTRY]);

    const res = await POST(makeReq({ concepts: [gap("Semantic Tags", "topic-not-creatable")] }));
    const body = await readJson(res);

    expect("error" in body).toBe(true);
    expect(loadVisualizerIndexAction).toHaveBeenCalled();
    expect(createVisualizerConceptAction).not.toHaveBeenCalled();
  });

  // The inverse case: a payload that falsely claims topic-not-creatable for a
  // concept that does NOT actually match anything in the real index must
  // still be attempted - proving the route derives the answer itself in
  // BOTH directions rather than trusting the label either way.
  it("a gap that matches nothing in the real index is still attempted even when the payload falsely claims reason: topic-not-creatable", async () => {
    mockIndex([]);
    vi.mocked(createVisualizerConceptAction).mockResolvedValue({
      url: "https://programming-concept-visualizer.vercel.app/languages/python?concept=x",
      slug: "x",
      topic: "python",
    } as never);

    const res = await POST(makeReq({ concepts: [gap("Quantum Foo", "topic-not-creatable")] }));
    const body = await readJson(res);

    expect(createVisualizerConceptAction).toHaveBeenCalledWith("Quantum Foo", "Quantum Foo evidence", "gemini");
    expect(body.created.some((c: { concept: string }) => c.concept === "Quantum Foo")).toBe(true);
  });

  // B4: the index is re-read fresh AT CREATION TIME - a concept that gained a
  // page since the scan (i.e. it is already in the freshly-loaded index) is
  // skipped rather than duplicated.
  it("B4: re-reads the index fresh and skips a concept that already gained a page, never duplicating it", async () => {
    mockIndex(INDEX_ENTRIES);
    vi.mocked(createVisualizerConceptAction).mockResolvedValue({ url: "u", slug: "s", topic: "python" } as never);

    const res = await POST(makeReq({ concepts: [gap("For Loops")] }));
    const body = await readJson(res);

    expect(body).toEqual({ created: [], skipped: ["For Loops"], failed: [], notAttempted: [] });
    expect(createVisualizerConceptAction).not.toHaveBeenCalled();
  });

  it("B2/B3: passes each gap's own evidence as context, isolates one failure, and reports which succeeded/failed", async () => {
    mockIndex([]);
    vi.mocked(createVisualizerConceptAction)
      .mockResolvedValueOnce({ error: "generation failed" } as never)
      .mockResolvedValueOnce({
        url: "https://programming-concept-visualizer.vercel.app/skills/databases?concept=joins",
        slug: "joins",
        topic: "databases",
      } as never);

    const res = await POST(makeReq({ concepts: [gap("Bad Concept"), gap("Joins")], provider: "gemini" }));
    const body = await readJson(res);

    expect(createVisualizerConceptAction).toHaveBeenNthCalledWith(1, "Bad Concept", "Bad Concept evidence", "gemini");
    expect(createVisualizerConceptAction).toHaveBeenNthCalledWith(2, "Joins", "Joins evidence", "gemini");
    expect(body).toEqual({
      created: [{ concept: "Joins", url: "https://programming-concept-visualizer.vercel.app/skills/databases?concept=joins" }],
      skipped: [],
      failed: [{ concept: "Bad Concept", error: "generation failed" }],
      notAttempted: [],
    });
  });

  // FINDING 14 (nit): `body.provider` arrives on the wire as an unvalidated
  // string - an allowlist check falls back to "gemini" for anything that is
  // not a real LlmProvider, for symmetry with the FINDING 9 re-derivation
  // above (never trust a caller-supplied value that drives behavior).
  it("FINDING 14: falls back to gemini when the payload's provider is not a real LlmProvider", async () => {
    mockIndex([]);
    vi.mocked(createVisualizerConceptAction).mockResolvedValue({
      url: "https://programming-concept-visualizer.vercel.app/languages/python?concept=x",
      slug: "x",
      topic: "python",
    } as never);

    await POST(makeReq({ concepts: [gap("Quantum Foo")], provider: "not-a-real-provider" }));

    expect(createVisualizerConceptAction).toHaveBeenCalledWith("Quantum Foo", "Quantum Foo evidence", "gemini");
  });

  it("propagates an index-load failure as its own distinguishable error, without attempting any creation", async () => {
    vi.mocked(loadVisualizerIndexAction).mockResolvedValue({ error: "GitHub is unreachable" } as never);

    const res = await POST(makeReq({ concepts: [gap("Quantum Foo")] }));
    const body = await readJson(res);

    expect(body).toEqual({ error: "GitHub is unreachable" });
    expect(createVisualizerConceptAction).not.toHaveBeenCalled();
  });

  it("an unexpected auth failure returns a 500 with the error message rather than throwing", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));

    const res = await POST(makeReq({ concepts: [gap("Quantum Foo")] }));
    const body = await readJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toContain("Not authorized");
  });

  describe("VISUALIZER_CREATE_MAX_PAGES", () => {
    it("attempts at most VISUALIZER_CREATE_MAX_PAGES gaps and reports the rest as notAttempted, never silently dropping them", async () => {
      mockIndex([]);
      vi.mocked(createVisualizerConceptAction).mockImplementation(async (concept: string) => ({
        url: `https://programming-concept-visualizer.vercel.app/languages/python?concept=${concept}`,
        slug: concept,
        topic: "python",
      }));
      const many = Array.from({ length: VISUALIZER_CREATE_MAX_PAGES + 3 }, (_, i) => gap(`Concept ${i}`));

      const res = await POST(makeReq({ concepts: many }));
      const body = await readJson(res);

      expect(createVisualizerConceptAction).toHaveBeenCalledTimes(VISUALIZER_CREATE_MAX_PAGES);
      expect(body.created).toHaveLength(VISUALIZER_CREATE_MAX_PAGES);
      // The overflow concepts were NEVER attempted, and are named explicitly
      // - not merged silently into `failed` or `skipped`.
      expect(body.notAttempted).toEqual(Array.from({ length: 3 }, (_, i) => `Concept ${VISUALIZER_CREATE_MAX_PAGES + i}`));
      expect(body.failed).toEqual([]);
    });

    it("reports notAttempted as empty when every gap fits inside the cap", async () => {
      mockIndex([]);
      vi.mocked(createVisualizerConceptAction).mockResolvedValue({
        url: "https://programming-concept-visualizer.vercel.app/languages/python?concept=x",
        slug: "x",
        topic: "python",
      } as never);

      const res = await POST(makeReq({ concepts: [gap("Solo Concept")] }));
      const body = await readJson(res);

      expect(body.notAttempted).toEqual([]);
    });

    // Partial-progress check: a genuine THROW (not just an {error} return) for
    // one gap must not erase an earlier gap's already-created page in the
    // same run - proves the per-gap try/catch covers exceptions, not only
    // error-shaped results.
    it("a thrown exception for one gap does not erase an earlier gap's success in the same run", async () => {
      mockIndex([]);
      vi.mocked(createVisualizerConceptAction)
        .mockResolvedValueOnce({
          url: "https://programming-concept-visualizer.vercel.app/languages/python?concept=first",
          slug: "first",
          topic: "python",
        } as never)
        .mockImplementationOnce(() => {
          throw new Error("network dropped mid-commit");
        });

      const res = await POST(makeReq({ concepts: [gap("First Concept"), gap("Second Concept")] }));
      const body = await readJson(res);

      expect(body.created).toEqual([
        { concept: "First Concept", url: "https://programming-concept-visualizer.vercel.app/languages/python?concept=first" },
      ]);
      expect(body.failed).toEqual([{ concept: "Second Concept", error: "network dropped mid-commit" }]);
      expect(body.notAttempted).toEqual([]);
    });
  });
});

// A1: an explicit ceiling, set the way the deck route sets its own - see this
// route's own header comment for why the value is 300 despite Hobby's real
// hard cap of 60s, and VISUALIZER_CREATE_MAX_PAGES' own doc comment
// (src/lib/visualizer/selection-coverage.ts) for the arithmetic sized against
// that real 60s ceiling.
describe("route segment config (A1)", () => {
  it("declares the nodejs runtime", () => {
    expect(runtime).toBe("nodejs");
  });

  it("declares an explicit maxDuration", () => {
    expect(maxDuration).toBe(300);
  });
});

// B5/SHOULD-FIX 8 precedent (visualizer-selection.test.ts's own "cross-write
// isolation" guard): this route must never import a Canvas write. Checked as
// SOURCE TEXT, not merely as a "not called" mock assertion - a mock-based
// check only proves today's code path never happens to call the wrong write,
// and would keep passing even if this route grew a direct Canvas import that
// this test file does not mock.
describe("cross-write isolation (source-text guard, mirrors SHOULD-FIX 8)", () => {
  const SOURCE_PATH = path.resolve(process.cwd(), "src/app/api/visualizer/create/route.ts");
  const source = fs.readFileSync(SOURCE_PATH, "utf-8");
  // Comments legitimately NAME createModuleItemAction in prose (explaining
  // why B5 holds structurally, i.e. that this route never imports it) - that
  // is not the same thing as actually importing or calling it, so this
  // check is against comment-stripped text, the same discipline
  // visualizerCoverage.wiring.test.ts's own stripComments applies.
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  it("never imports createModuleItemAction or any other Canvas-modules write", () => {
    expect(stripped).not.toMatch(/createModuleItemAction/);
    expect(stripped).not.toMatch(/from ["']@\/app\/actions\/canvas-modules["']/);
  });
});
