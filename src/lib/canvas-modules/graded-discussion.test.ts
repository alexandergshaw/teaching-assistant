// TDD suite for the complete graded-discussion Canvas write layer
// (docs/intro-discussion-from-modules-acceptance-criteria.md AC14/AC14e-i,
// section 5b D2, revised by step-10 findings H1/M3/M6/reviewer #7 -
// checkpoints are now explicit opt-in via `useCheckpoints`, and a missing
// deadline diverts to the classic path before ever calling GraphQL).
//
// @/lib/canvas-modules is left UNMOCKED and only globalThis.fetch is
// stubbed, so resolveCourse runs for real - the "stub fetch, let resolveCourse
// run for real" idiom this repo uses for Canvas write helpers (see
// module-content.test.ts's own header comment).
//
// canvas.mccneb.edu is the hardcoded host for the "MCC" institution code in
// src/lib/canvas-core.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGradedDiscussion, checkpointDate, type NewGradedDiscussion } from "./graded-discussion";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

// M6: the ONLY producer of these strings in the app is
// Date.prototype.toISOString(), which always emits "...Z" with milliseconds -
// never a "-05:00"-style offset. Fixtures use that shape so a green suite
// actually proves something about what the app emits.
const BASE_FIELDS: NewGradedDiscussion = {
  title: "Introduce Yourself",
  message: "<p>Tell us about yourself.</p>",
  pointsPossible: 20,
  initialPostPoints: 10,
  repliesPoints: 10,
  initialPostAt: "2026-09-10T23:59:00.000Z",
  repliesDueAt: "2026-09-13T23:59:00.000Z",
  requiredReplyCount: 2,
  published: false,
  useCheckpoints: true,
};

interface Recorded {
  url: string;
  method: string;
  body: string | undefined;
}

let recorded: Recorded[] = [];

/** GraphQL response variant: "flag" (checkpoints unavailable, the ONE message
 * that triggers a fallback), "other-error" (a different top-level error -
 * must throw, never fall back), or "success" (checkpoints created). */
function stubCanvas(graphqlVariant: "flag" | "other-error" | "success") {
  recorded = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    recorded.push({ url: href, method: init?.method ?? "GET", body: init?.body as string | undefined });

    if (href.endsWith("/api/graphql")) {
      if (graphqlVariant === "flag") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            errors: [{ message: "discussion_checkpoints feature flag must be enabled" }],
          }),
        } as unknown as Response;
      }
      if (graphqlVariant === "other-error") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ errors: [{ message: "Some other unrelated GraphQL failure" }] }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            createDiscussionTopic: {
              discussionTopic: { _id: "9001", title: BASE_FIELDS.title, assignment: { _id: "500", hasSubAssignments: true } },
              errors: [],
            },
          },
        }),
      } as unknown as Response;
    }

    if (href.includes("/discussion_topics")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 555 }),
      } as unknown as Response;
    }

    throw new Error(`Unexpected fetch to ${href}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function graphqlBody(): { query: string; variables: { input: Record<string, unknown> } } {
  const call = recorded.find((r) => r.url.endsWith("/api/graphql"));
  if (!call?.body) throw new Error("No GraphQL call was recorded.");
  return JSON.parse(call.body);
}

function restCall(): Recorded {
  const call = recorded.find((r) => r.url.includes("/discussion_topics"));
  if (!call) throw new Error("No REST discussion_topics call was recorded.");
  return call;
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createGradedDiscussion: useCheckpoints opt-in (H1)", () => {
  it("useCheckpoints: false never calls GraphQL at all - classic path only, no fallbackReason", async () => {
    const fetchMock = stubCanvas("success"); // would return a checkpoints success if ever called

    const result = await createGradedDiscussion(COURSE_URL, { ...BASE_FIELDS, useCheckpoints: false });

    expect(result).toEqual({ id: 555, path: "classic" });
    expect(result.fallbackReason).toBeUndefined();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/api/graphql"))).toBe(false);
    expect(recorded.some((r) => r.url.includes("/discussion_topics") && r.method === "POST")).toBe(true);
  });

  it("useCheckpoints: true attempts GraphQL when both deadlines are present", async () => {
    stubCanvas("success");

    const result = await createGradedDiscussion(COURSE_URL, BASE_FIELDS);

    expect(result).toEqual({ id: 9001, path: "checkpoints" });
    expect(recorded.some((r) => r.url.endsWith("/api/graphql"))).toBe(true);
  });

  it("a flag-off fallback names the discussion title and warns of a stray assignment (H1)", async () => {
    stubCanvas("flag");

    const result = await createGradedDiscussion(COURSE_URL, BASE_FIELDS);

    expect(result.path).toBe("classic");
    expect(result.fallbackReason).toContain(BASE_FIELDS.title);
    expect(result.fallbackReason).toMatch(/stray/i);
    expect(result.fallbackReason).toMatch(/assignment/i);
    // The full original sentence (M1) must still be present, not shortened.
    expect(result.fallbackReason).toMatch(
      /Only the initial-post deadline is graded by Canvas; the replies deadline is enforced by the thread closing, not by a separate grade\./
    );
  });
});

describe("createGradedDiscussion: missing-date safety (reviewer #7)", () => {
  it("diverts to classic, without ever calling GraphQL, when initialPostAt is missing", async () => {
    const fetchMock = stubCanvas("success");

    const result = await createGradedDiscussion(COURSE_URL, { ...BASE_FIELDS, initialPostAt: "" });

    expect(result.path).toBe("classic");
    expect(result.fallbackReason).toBeTruthy();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/api/graphql"))).toBe(false);
  });

  it("diverts to classic, without ever calling GraphQL, when repliesDueAt is missing", async () => {
    const fetchMock = stubCanvas("success");

    const result = await createGradedDiscussion(COURSE_URL, { ...BASE_FIELDS, repliesDueAt: "" });

    expect(result.path).toBe("classic");
    expect(result.fallbackReason).toBeTruthy();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/api/graphql"))).toBe(false);
  });

  it("still creates the classic discussion with no dates set when both are missing (AC21)", async () => {
    stubCanvas("success");

    const result = await createGradedDiscussion(COURSE_URL, { ...BASE_FIELDS, initialPostAt: "", repliesDueAt: "" });

    expect(result.path).toBe("classic");
    const params = new URLSearchParams(restCall().body);
    expect(params.has("assignment[due_at]")).toBe(false);
    expect(params.has("assignment[lock_at]")).toBe(false);
  });
});

describe("checkpointDate: dates[] shape (unit, since createGradedDiscussion no longer reaches this with a missing date)", () => {
  it("carries type 'everyone' and dueAt when a date is present", () => {
    expect(checkpointDate("2026-09-10T23:59:00.000Z")).toEqual({
      type: "everyone",
      dueAt: "2026-09-10T23:59:00.000Z",
    });
  });

  it("omits dueAt entirely (not an empty string) when the date is empty", () => {
    expect(checkpointDate("")).toEqual({ type: "everyone" });
  });
});

describe("createGradedDiscussion: checkpoints mutation shape (AC14e - the five hard rules)", () => {
  it("sends EXACTLY two checkpoints, reply_to_topic then reply_to_entry, each dated 'everyone'", async () => {
    stubCanvas("success");

    await createGradedDiscussion(COURSE_URL, BASE_FIELDS);

    const { variables } = graphqlBody();
    const checkpoints = variables.input.checkpoints as Array<Record<string, unknown>>;
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0].checkpointLabel).toBe("reply_to_topic");
    expect(checkpoints[1].checkpointLabel).toBe("reply_to_entry");
    expect((checkpoints[0].dates as Array<{ type: string }>)[0].type).toBe("everyone");
    expect((checkpoints[1].dates as Array<{ type: string }>)[0].type).toBe("everyone");
  });

  it("puts repliesRequired ONLY on the reply_to_entry checkpoint", async () => {
    stubCanvas("success");

    await createGradedDiscussion(COURSE_URL, BASE_FIELDS);

    const { variables } = graphqlBody();
    const checkpoints = variables.input.checkpoints as Array<Record<string, unknown>>;
    expect(checkpoints[0].repliesRequired).toBeUndefined();
    expect(checkpoints[1].repliesRequired).toBe(2);
  });

  it("sends assignment.forCheckpoints true, courseId matching contextId, and NO pointsPossible/dueAt/lockAt on the assignment", async () => {
    stubCanvas("success");

    await createGradedDiscussion(COURSE_URL, BASE_FIELDS);

    const { variables } = graphqlBody();
    const assignment = variables.input.assignment as Record<string, unknown>;
    expect(assignment.forCheckpoints).toBe(true);
    expect(assignment.courseId).toBe(variables.input.contextId);
    expect(assignment).not.toHaveProperty("pointsPossible");
    expect(assignment).not.toHaveProperty("dueAt");
    expect(assignment).not.toHaveProperty("lockAt");
    expect(assignment).not.toHaveProperty("unlockAt");
  });

  it("carries the checkpoint due dates and requireInitialPost true", async () => {
    stubCanvas("success");

    await createGradedDiscussion(COURSE_URL, BASE_FIELDS);

    const { variables } = graphqlBody();
    const checkpoints = variables.input.checkpoints as Array<Record<string, unknown>>;
    expect(variables.input.requireInitialPost).toBe(true);
    expect((checkpoints[0].dates as Array<{ dueAt?: string }>)[0].dueAt).toBe(BASE_FIELDS.initialPostAt);
    expect((checkpoints[1].dates as Array<{ dueAt?: string }>)[0].dueAt).toBe(BASE_FIELDS.repliesDueAt);
  });

  it("returns path: checkpoints with the Canvas-reported id on success", async () => {
    stubCanvas("success");

    const result = await createGradedDiscussion(COURSE_URL, BASE_FIELDS);

    expect(result).toEqual({ id: 9001, path: "checkpoints" });
  });

  it("uses fields.initialPostAt as a deliberately non-Z-offset string once, to confirm Canvas is not assumed to require Z specifically", async () => {
    // Deliberate exception to the "toISOString-shape fixtures" rule (M6): this
    // one case tests that the write layer passes ANY ISO8601-with-offset
    // string through unchanged, not that the app ever produces this shape.
    stubCanvas("success");

    await createGradedDiscussion(COURSE_URL, {
      ...BASE_FIELDS,
      initialPostAt: "2026-09-10T23:59:00-05:00",
      repliesDueAt: "2026-09-13T23:59:00-05:00",
    });

    const { variables } = graphqlBody();
    const checkpoints = variables.input.checkpoints as Array<Record<string, unknown>>;
    expect((checkpoints[0].dates as Array<{ dueAt?: string }>)[0].dueAt).toBe("2026-09-10T23:59:00-05:00");
  });
});

describe("createGradedDiscussion: both paths post the SAME total, always (M3 anti-drift property)", () => {
  // Deliberately does NOT hardcode a 10/10 split - that would just re-freeze
  // the exact drift bug this test exists to catch. Instead it pins the
  // INVARIANT: whatever valid split the caller passes, the checkpoints' two
  // shares sum to exactly pointsPossible, and the classic path's single
  // assignment total is exactly that total too - so the two paths can never
  // silently disagree about how many points the discussion is worth.
  it.each([
    [20, 10, 10, "even"],
    [21, 11, 10, "odd"],
  ])(
    "checkpoints sum to exactly %i points possible (%s/%s split, %s total), matching the classic path's total",
    async (total, initialPostPoints, repliesPoints) => {
      const fields = { ...BASE_FIELDS, pointsPossible: total, initialPostPoints, repliesPoints };

      // Checkpoints path: sum the two checkpoints' pointsPossible. NOTE: this
      // sum is not asserted against `total` directly here - createGradedDiscussion
      // throws before ever reaching Canvas unless initialPostPoints + repliesPoints
      // already equals pointsPossible (M3's own validation guard), so that
      // assertion could never actually fail (step-10 finding 3b) and only the
      // "the two paths agree" comparison below carries real weight: a
      // regression that mis-assembled the checkpoints array (e.g. dropping
      // one checkpoint's points) would make checkpointSum disagree with
      // classicTotal even though both nominally derive from the same `total`.
      stubCanvas("success");
      await createGradedDiscussion(COURSE_URL, fields);
      const { variables } = graphqlBody();
      const checkpoints = variables.input.checkpoints as Array<{ pointsPossible: number }>;
      const checkpointSum = checkpoints[0].pointsPossible + checkpoints[1].pointsPossible;

      // Classic path (separate call, same fields): its one assignment total.
      stubCanvas("flag");
      await createGradedDiscussion(COURSE_URL, fields);
      const classicTotal = Number(new URLSearchParams(restCall().body).get("assignment[points_possible]"));
      expect(classicTotal).toBe(total);

      // The two paths agree with each other, not just with the input.
      expect(checkpointSum).toBe(classicTotal);
    }
  );

  it("throws loudly, before calling Canvas at all, when initialPostPoints + repliesPoints does not equal pointsPossible", async () => {
    const fetchMock = stubCanvas("success");

    await expect(
      createGradedDiscussion(COURSE_URL, { ...BASE_FIELDS, pointsPossible: 20, initialPostPoints: 10, repliesPoints: 9 })
    ).rejects.toThrow(/initialPostPoints.*repliesPoints.*must equal pointsPossible/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createGradedDiscussion: availability detection is never a silent fallback (AC14g)", () => {
  it("falls back to classic ONLY on the exact flag message, reporting path + fallbackReason, and actually fires the classic POST", async () => {
    stubCanvas("flag");

    const result = await createGradedDiscussion(COURSE_URL, BASE_FIELDS);

    expect(result.path).toBe("classic");
    expect(result.id).toBe(555);
    expect(result.fallbackReason).toBeTruthy();
    expect(result.fallbackReason).toMatch(/checkpoints/i);
    // The classic POST really did fire - not just a claim in the result.
    expect(recorded.some((r) => r.url.includes("/discussion_topics") && r.method === "POST")).toBe(true);
  });

  it("throws on any OTHER top-level GraphQL error, preserving the message, and never falls back", async () => {
    stubCanvas("other-error");

    await expect(createGradedDiscussion(COURSE_URL, BASE_FIELDS)).rejects.toThrow(/Some other unrelated GraphQL failure/);

    // No REST call was made - a real failure must never be disguised as a fallback.
    expect(recorded.some((r) => r.url.includes("/discussion_topics"))).toBe(false);
  });
});

describe("createGradedDiscussion: classic REST fallback shape (AC14h, corrected by AC13b)", () => {
  it("sends assignment[lock_at] and NEVER a top-level lock_at - frozen literal body", async () => {
    stubCanvas("flag");

    await createGradedDiscussion(COURSE_URL, BASE_FIELDS);

    const call = restCall();
    expect(call.url).toBe("https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics");
    const params = new URLSearchParams(call.body);
    expect(params.get("title")).toBe("Introduce Yourself");
    expect(params.get("message")).toBe("<p>Tell us about yourself.</p>");
    expect(params.get("published")).toBe("false");
    expect(params.get("discussion_type")).toBe("threaded");
    expect(params.get("require_initial_post")).toBe("true");
    expect(params.get("assignment[points_possible]")).toBe("20");
    expect(params.get("assignment[due_at]")).toBe("2026-09-10T23:59:00.000Z");
    expect(params.get("assignment[lock_at]")).toBe("2026-09-13T23:59:00.000Z");
    expect(params.has("lock_at")).toBe(false);
    expect(params.has("due_at")).toBe(false);
    expect(params.has("points_possible")).toBe(false);
    // Every param name accounted for - a frozen literal, not just spot checks.
    expect([...params.keys()].sort()).toEqual(
      [
        "title",
        "message",
        "published",
        "discussion_type",
        "require_initial_post",
        "assignment[points_possible]",
        "assignment[due_at]",
        "assignment[lock_at]",
      ].sort()
    );
  });

  it("omits assignment[due_at] and assignment[lock_at] entirely when the fields are empty (AC21)", async () => {
    stubCanvas("flag");

    await createGradedDiscussion(COURSE_URL, { ...BASE_FIELDS, initialPostAt: "", repliesDueAt: "" });

    const params = new URLSearchParams(restCall().body);
    expect(params.has("assignment[due_at]")).toBe(false);
    expect(params.has("assignment[lock_at]")).toBe(false);
    // points_possible is unaffected by the missing dates.
    expect(params.get("assignment[points_possible]")).toBe("20");
  });
});

describe("createGradedDiscussion: requiredReplyCount validation", () => {
  it("rejects a value above 10 before ever calling Canvas", async () => {
    const fetchMock = stubCanvas("success");

    await expect(
      createGradedDiscussion(COURSE_URL, { ...BASE_FIELDS, requiredReplyCount: 11 })
    ).rejects.toThrow(/requiredReplyCount/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a negative value before ever calling Canvas", async () => {
    const fetchMock = stubCanvas("success");

    await expect(
      createGradedDiscussion(COURSE_URL, { ...BASE_FIELDS, requiredReplyCount: -1 })
    ).rejects.toThrow(/requiredReplyCount/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
