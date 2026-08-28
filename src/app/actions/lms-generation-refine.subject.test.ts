import { describe, it, expect, vi, beforeEach } from "vitest";

// Tests for saveEditedGeneratedArtifactAction's edited-SUBJECT handling (AC
// B4/B5, AC A3a/A3b - docs/announcement-preview-edit-before-post-acceptance-
// criteria.md), split into a NEW file rather than appended to
// lms-generation-refine.test.ts, which is already at this project's 1000-line
// ceiling on its own (that file's own header comment explains why splits in
// this area happen before, not after, the ceiling is hit). This is new
// coverage, not a move - unlike that file's own header comment, nothing here
// was lifted from elsewhere.
//
// The mock/import/fixture header below is copied from
// lms-generation-refine.test.ts's own header rather than invented fresh - see
// that file's header comment for why each mock exists (this file's own
// WAVE 2A brief accepted that duplication as a known cost of the split, the
// same tradeoff lms-generation-refine.test.ts itself made against
// lms-generation.test.ts). Only the mocks/imports this file's tests actually
// exercise are kept: saveEditedGeneratedArtifactAction needs no generator
// mock (it never calls one - E3), and never touches postGeneratedArtifactAction,
// so this file does not need the full generator-mock list
// lms-generation-refine.test.ts carries only to satisfy that file's real,
// unmocked "./lms-generation" import for ITS knowledgeChecks post-path test.
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(() => ({ __fake: "supabase" })) }));
vi.mock("./lms-syllabus-buttons", () => ({ resolveLmsCourseRowAction: vi.fn(), resolveLmsCourseRowByIdAction: vi.fn() }));
vi.mock("./lecture-plans", () => ({ reviseLectureSlidesAction: vi.fn() }));
vi.mock("@/lib/supabase/generated-artifacts", () => ({
  saveGeneratedArtifactVersion: vi.fn(),
  listGeneratedArtifactVersions: vi.fn(),
}));
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { requireOwner } from "@/lib/supabase/auth";
import { resolveLmsCourseRowAction } from "./lms-syllabus-buttons";
import { saveGeneratedArtifactVersion } from "@/lib/supabase/generated-artifacts";
import { saveEditedGeneratedArtifactAction } from "./lms-generation-refine";
import {
  GENERATION_KIND_IDS,
  kindSupportsTextEdit,
  kindTitleIsContent,
  type GenerationKindId,
} from "@/lib/lms-generation/kinds";

const COURSE_URL = "https://canvas.example.edu/courses/100";

const FAKE_COURSE = {
  id: "course-1",
  name: "Intro to Widgets",
  canvasUrl: COURSE_URL,
  institution: "MIT",
  courseKind: null,
};

function mockOwner() {
  vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "owner@example.com" } as never);
}

function mockResolvedCourse() {
  vi.mocked(resolveLmsCourseRowAction).mockResolvedValue({ course: FAKE_COURSE } as never);
}

function mockSavedArtifact() {
  vi.mocked(saveGeneratedArtifactVersion).mockResolvedValue({ id: "artifact-1", version: 1 } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOwner();
});

// ── AC B4/B5: the edited-subject resolution ─────────────────────────────────
describe("saveEditedGeneratedArtifactAction - edited title (AC B4/B5)", () => {
  it("B4: a supplied title WINS over currentTitle for a TITLED_GENERIC_KINDS kind", async () => {
    mockResolvedCourse();
    mockSavedArtifact();

    await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "announcements",
      text: "Hand-edited announcement body.",
      currentTitle: "Old subject - should be overwritten",
      title: "New subject the instructor typed",
    });

    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    // SABOTAGE TARGET: dropping the supplied-title branch (falling back to
    // `input.currentTitle ?? null` unconditionally) saves the OLD subject
    // here instead.
    expect(input.title).toBe("New subject the instructor typed");
  });

  it("B4: an ABSENT title leaves today's carry-forward byte-identical, including writing null when currentTitle is undefined too", async () => {
    mockResolvedCourse();
    mockSavedArtifact();

    await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "announcements",
      text: "Hand-edited announcement body.",
      // No `currentTitle`, no `title` - the exact shape today's callers that
      // predate this field still send.
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    // SABOTAGE TARGET: this is the constraint the brief calls out as easy to
    // break - an absent `title` must still resolve to `null`, not `undefined`
    // and not be omitted, when `currentTitle` is itself absent.
    expect(input.title).toBeNull();
  });

  it("B4: an ABSENT title still falls back to a SUPPLIED currentTitle (today's exact carry-forward)", async () => {
    mockResolvedCourse();
    mockSavedArtifact();

    await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "announcements",
      text: "Hand-edited announcement body.",
      currentTitle: "Carried forward unchanged",
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input.title).toBe("Carried forward unchanged");
  });

  it("B5: a SUPPLIED blank/whitespace-only title is refused, and saves nothing", async () => {
    const result = await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "announcements",
      text: "Hand-edited announcement body.",
      currentTitle: "Existing subject",
      title: "   ",
    });

    expect("error" in result).toBe(true);
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
    // Refused before the course is even resolved, matching the existing
    // blank-text guard's own placement (E5, lms-generation-refine.test.ts).
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
  });

  it("B5: an ABSENT title is never refused, even though currentTitle carries forward as null (must not collide with AC B4's null case)", async () => {
    mockResolvedCourse();
    mockSavedArtifact();

    const result = await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "announcements",
      text: "Hand-edited announcement body.",
    });

    // SABOTAGE TARGET: an unqualified blank-title guard (checking the
    // resolved/carried value instead of only the SUPPLIED one) would refuse
    // this legitimate null-carrying legacy save.
    expect("error" in result).toBe(false);
    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
  });

  it("B5: a supplied title is trimmed before being persisted, mirroring how text is already trimmed", async () => {
    mockResolvedCourse();
    mockSavedArtifact();

    await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "announcements",
      text: "Hand-edited announcement body.",
      title: "  Padded subject  ",
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input.title).toBe("Padded subject");
  });

  it("a non-titled kind (qa) never sets a title key, even when an edited title is supplied", async () => {
    mockResolvedCourse();
    mockSavedArtifact();

    await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      text: "Hand-edited Q&A text.",
      title: "Should never be written - qa has no title column use",
    });

    // SABOTAGE TARGET: resolving the edited title OUTSIDE the
    // TITLED_GENERIC_KINDS true-branch would write a title key here, which
    // the existing lms-generation-refine.test.ts:1057 canary
    // (`"title" in input` === false for non-titled kinds) already forbids for
    // the currentTitle-only case - this test pins the same fact for the new
    // edited-title path.
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect("title" in input).toBe(false);
  });
});

// ── AC A3a/A3b: kindTitleIsContent is a STRICT SUBSET of TITLED_GENERIC_KINDS ──
//
// TITLED_GENERIC_KINDS (lms-generation-refine.ts) is module-private and
// cannot be imported here - the sibling canary in lms-generation-refine.test.ts
// already says so in as many words (see that file, its own
// "TITLED_GENERIC_KINDS canary" describe block) - and it cannot be exported
// either, since that file is "use server", where only async exports compile
// and `next build` is the only gate that catches a violation. So, exactly
// like that sibling canary, this one is BEHAVIOURAL: it drives every kind
// where `kindTitleIsContent` is true through the real
// saveEditedGeneratedArtifactAction with an edited title, and asserts the
// persisted title is the edited value. A kind with the flag but missing from
// TITLED_GENERIC_KINDS makes `carriedTitle` evaluate to `{}` - no `title` key
// written at all - and this test fails by name for that kind.
//
// THE INVARIANT IS A STRICT SUBSET, NOT EQUALITY (AC A3a): TITLED_GENERIC_KINDS
// also holds "objectives"/"assignments"/"scripts"/"resources", whose titles
// are DERIVED at generate time from a module label and must NOT gain subject
// editing - so this canary only ever walks the `kindTitleIsContent` kinds
// (today, just "announcements"), never the reverse. Asserting the two lists
// are equal would be wrong and would fail the moment a fifth
// TITLED_GENERIC_KINDS kind (e.g. a future derived-title kind) is added
// without also flipping `titleIsContent` on it.
describe("kindTitleIsContent is a subset of TITLED_GENERIC_KINDS (AC A3a/A3b)", () => {
  const subjectEditableKinds = GENERATION_KIND_IDS.filter((id) => kindTitleIsContent(id));

  it.each(subjectEditableKinds)(
    "kind \"%s\": kindTitleIsContent implies kindSupportsTextEdit (precondition for reaching the title resolution at all)",
    (kind) => {
      // The action refuses any kind kindSupportsTextEdit says no to (E4, ~
      // lms-generation-refine.ts:464) BEFORE ever reaching the title
      // resolution - a structured kind (decks/knowledgeChecks) could never
      // save an edited subject through this path even if it declared the
      // flag. Pinning this here means a future kind that sets
      // titleIsContent without also being text-editable fails loudly
      // here, not silently at the modal.
      expect(kindSupportsTextEdit(kind)).toBe(true);
    }
  );

  it.each(subjectEditableKinds)(
    "kind \"%s\": an edited title is actually persisted, proving it is IN TITLED_GENERIC_KINDS",
    async (kind: GenerationKindId) => {
      mockResolvedCourse();
      mockSavedArtifact();

      await saveEditedGeneratedArtifactAction({
        courseUrl: COURSE_URL,
        kind,
        text: "Hand-edited text.",
        title: "Subset Canary Title",
      });

      expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
      const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
      // SABOTAGE TARGET: removing this kind from TITLED_GENERIC_KINDS (while
      // leaving `titleIsContent: true` on its kinds.ts config) makes
      // `carriedTitle` evaluate to `{}` for it - no `title` key at all - and
      // this assertion fails naming the kind.
      expect(input.title).toBe("Subset Canary Title");
    }
  );

  it("sanity: the subject-editable kind set is non-empty, so the loops above cannot vacuously pass", () => {
    // SABOTAGE TARGET: deleting `titleIsContent: true` from every kind's
    // config (or from announcements' specifically) would make
    // `subjectEditableKinds` empty, and both `it.each` blocks above would
    // report zero tests instead of failing - this sanity check is what turns
    // that silent pass into a loud one.
    expect(subjectEditableKinds.length).toBeGreaterThan(0);
    expect(subjectEditableKinds).toContain("announcements");
  });
});
