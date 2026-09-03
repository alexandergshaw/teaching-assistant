// BLOCKER 3: gatherReplyResourcesAction's own redaction, tested AT ITS CALL
// SITE - not only against the leaf (discussion-reply-redact.test.ts) it
// delegates to. The bulk path fires automatically on every reply that lands
// (R6) with no user action, so it out-volumes the per-row path
// (useReplyResources.ts's searchRow/deriveRowSearchConcept) that was
// hardened first. Before this fix, `gatherReplyResourcesAction` mapped
// `posts` straight through `deriveResourceConcept(p.text)` with no
// redaction step at all - an `author` field sitting right next to `text`
// was never even read, let alone used to strip a self-introduction out of
// the post BODY.
//
// Deliberately a SEPARATE test file from discussion-replies.test.ts (which
// is ratcheted at its current 1105 lines by src/file-size-ceiling.structure.test.ts
// and must not grow further) rather than appended there - see the mocking
// setup below, duplicated rather than imported, per this repo's own
// "no cross-test-file imports" rule (importing a helper/mock-registry from
// another *.test.ts file re-runs that file's own top-level module mocks).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("./learning-resource-links", () => ({
  findResourceLinksForConceptsAction: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { findResourceLinksForConceptsAction } from "./learning-resource-links";
import { gatherReplyResourcesAction } from "./discussion-replies";

const OWNER = { id: "owner-1", email: "owner@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
});

// Y5/Y8 (docs/reply-resource-search-yield-acceptance-criteria.md): `perConcept`
// is now a REQUIRED field on `FindResourceLinksSuccess` and
// gatherReplyResourcesAction reads it unconditionally - an empty array is
// enough here since none of this file's own assertions inspect the resulting
// outcome, only the concepts array the mock was CALLED with.
function mockLinksOnce(links: Array<Record<string, unknown>>, degraded = false) {
  vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce({
    links,
    degraded,
    droppedUncorroborated: 0,
    droppedPlaceholder: 0,
    droppedUnreachable: 0,
    notes: [],
    perConcept: [],
  } as never);
}

describe("gatherReplyResourcesAction - BLOCKER 3, redaction at the bulk path's own call site", () => {
  it("a self-introducing first post ('Hi everyone, I'm Maria...') never reaches the reused search action with the author's name in it", async () => {
    mockLinksOnce([]);
    await gatherReplyResourcesAction(
      [{ id: "p1", text: "Hi everyone, I'm Maria Alvarez and I loved this week's topic.", author: "Maria Alvarez" }],
      "",
      "gemini"
    );
    expect(findResourceLinksForConceptsAction).toHaveBeenCalledTimes(1);
    const concepts = vi.mocked(findResourceLinksForConceptsAction).mock.calls[0][0] as string[];
    expect(concepts.some((c) => /\bmaria\b/i.test(c))).toBe(false);
    expect(concepts.some((c) => /\balvarez\b/i.test(c))).toBe(false);
  });

  it("an accented author name is redacted from the post body too, not left exempt by an ASCII-only boundary check", async () => {
    mockLinksOnce([]);
    await gatherReplyResourcesAction(
      [{ id: "p1", text: "José here, thanks for the great discussion this week.", author: "José Fernandez" }],
      "",
      "gemini"
    );
    const concepts = vi.mocked(findResourceLinksForConceptsAction).mock.calls[0][0] as string[];
    expect(concepts.some((c) => c.toLowerCase().includes("josé"))).toBe(false);
  });

  it("a second surname mentioned in the post body (not the derived last name) is still redacted", async () => {
    mockLinksOnce([]);
    await gatherReplyResourcesAction(
      [{ id: "p1", text: "Santos here again, mitosis still confuses me a bit.", author: "Ana Maria Santos Silva" }],
      "",
      "gemini"
    );
    const concepts = vi.mocked(findResourceLinksForConceptsAction).mock.calls[0][0] as string[];
    expect(concepts.some((c) => /\bsantos\b/i.test(c))).toBe(false);
  });

  it("a post with no `author` field at all (pre-fix call shape) behaves exactly as before - no redaction attempted, never throws", async () => {
    mockLinksOnce([]);
    const result = await gatherReplyResourcesAction([{ id: "p1", text: "A post about recursion in Python." }], "", "gemini");
    expect("resources" in result).toBe(true);
    const concepts = vi.mocked(findResourceLinksForConceptsAction).mock.calls[0][0] as string[];
    expect(concepts).toEqual(["A post about recursion in Python."]);
  });

  it("an unrelated name that merely shares a substring with the author's name is left alone - the fix does not over-redact", async () => {
    mockLinksOnce([]);
    await gatherReplyResourcesAction(
      [{ id: "p1", text: "I agree with Marcus about the reading, on a related note.", author: "Maria Lopez" }],
      "",
      "gemini"
    );
    const concepts = vi.mocked(findResourceLinksForConceptsAction).mock.calls[0][0] as string[];
    expect(concepts.some((c) => c.includes("Marcus"))).toBe(true);
  });

  it("SABOTAGE CHECK: an author name that is the ENTIRE post text yields no call at all (empty concept after redaction), proving redaction runs before the empty-concept short-circuit, not after", async () => {
    // If redaction were skipped, "Maria Lopez" would still be a non-empty
    // concept and the reused action WOULD be called with the name in it -
    // this pins that the empty-after-redaction case is dropped exactly like
    // any other empty concept (gatherReplyResourcesAction's own
    // `entries.length === 0` branch), rather than leaking the bare name.
    const result = await gatherReplyResourcesAction([{ id: "p1", text: "Maria Lopez", author: "Maria Lopez" }], "", "gemini");
    // Y8: the entries.length === 0 branch (every post's concept is empty)
    // sets NO outcome at all - nothing was ever searched, so there is
    // nothing to explain (see discussion-replies.ts's own comment on that
    // branch, and the AC's "neither does a post whose derived concept is
    // EMPTY").
    expect(result).toEqual({
      resources: [{ id: "p1", resources: [] }],
      degraded: false,
    });
    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      expect("outcome" in result.resources[0]).toBe(false);
    }
    expect(findResourceLinksForConceptsAction).not.toHaveBeenCalled();
  });
});
