// Wave 0B structural split (docs/bulk-bar-reorganization-acceptance-criteria.md
// section 3b/D5): useLmsGeneration.test.ts sat at exactly this repo's 1000-line
// ceiling, so the note-text describe blocks below - generationSuccessNote,
// refineSuccessNote, editSuccessNote, previewMetaText, postResultNote and
// versionOptionLabel - moved here UNCHANGED, along existing describe-block
// boundaries. No assertion's meaning changed; this is a file split only. See
// useLmsGeneration.test.ts's own header comment for what this suite as a
// whole can and cannot reach (node-env vitest, no component ever rendered).
//
// Imports stay from "./useLmsGeneration" (the barrel) rather than the
// lmsGenerationNotes.ts leaf these functions actually live in - the source
// file split already happened in an earlier wave and re-exports everything,
// so nothing here needs a new path.
import { describe, expect, it } from "vitest";
import type { PostSummary } from "@/lib/lms-generation/commit-plan";
import {
  editSuccessNote,
  generationSuccessNote,
  kindOffersPost,
  postResultNote,
  previewMetaText,
  refineSuccessNote,
  versionOptionLabel,
} from "./useLmsGeneration";
import { describeMissingDeadlines } from "@/lib/lms-generation/intro-discussion-deadlines";

describe("generationSuccessNote / refineSuccessNote", () => {
  // Per this repo's own lesson (source-text-tests-overspecify): pin the
  // FACTS a later edit must not silently lose, not the exact prose. P6: for
  // the three original "save-version" kinds, the "nothing was written to
  // Canvas" sentence must remain EXACTLY as it always has - their own tests
  // assert it verbatim below.
  it("names the kind and version and states plainly that Canvas was not touched, for a save-version kind", () => {
    const note = generationSuccessNote("qa", 2, "3 items");
    expect(note).toContain("Anticipated lecture Q&A");
    expect(note).toContain("2");
    expect(note).toContain("3 items");
    expect(note).toContain("nothing was written to Canvas");
  });

  it("refine note also names the kind, the new version, and the Canvas fact, for a save-version kind", () => {
    const note = refineSuccessNote("currentEvents", 4);
    expect(note).toContain("Current events");
    expect(note).toContain("4");
    expect(note).toContain("nothing was written to Canvas");
  });

  it("SABOTAGE TARGET: every save-version kind gets the EXACT unmodified sentence", () => {
    // Pinned verbatim (not just toContain) for the three kinds whose test
    // coverage the acceptance-criteria doc explicitly calls out as needing
    // to stay byte-for-byte identical - this is the one place in this
    // describe block where the exact prose itself is the fact being
    // protected, not merely a substring of it.
    expect(generationSuccessNote("qa", 1, "1 item")).toBe(
      'Generated "Anticipated lecture Q&A" (version 1) from 1 item. Saved to this course\'s generated content - nothing was written to Canvas.'
    );
    expect(refineSuccessNote("decks", 2)).toBe(
      'Created a new version of "Lecture deck" (version 2) from your instructions. Saved to this course\'s generated content - nothing was written to Canvas.'
    );
  });

  // P6: a "save-and-post" kind's copy must be ACCURATE instead - generating
  // alone still never writes to Canvas (do not overcorrect into implying it
  // does), but it must say so without reusing the old kinds' exact "nothing
  // was written to Canvas" wording, so the two cases stay visibly distinct in
  // the UI rather than reading like an identical, now-half-true claim.
  it("a save-and-post kind's generate note names the kind/version and points at posting as the next step, without claiming nothing was written", () => {
    const note = generationSuccessNote("objectives", 3, "2 items");
    expect(note).toContain("Module objectives");
    expect(note).toContain("3");
    expect(note).toContain("2 items");
    expect(note).toContain("Post to Canvas");
    expect(note).not.toContain("nothing was written to Canvas");
  });

  it("a save-and-post kind's refine note follows the same rule", () => {
    const note = refineSuccessNote("announcements", 5);
    expect(note).toContain("Announcement");
    expect(note).toContain("5");
    expect(note).toContain("Post to Canvas");
    expect(note).not.toContain("nothing was written to Canvas");
  });

  it("kindOffersPost distinguishes the two groups this whole split depends on", () => {
    expect(kindOffersPost("qa")).toBe(false);
    expect(kindOffersPost("currentEvents")).toBe(false);
    expect(kindOffersPost("decks")).toBe(false);
    // X1: "scripts" (chunk 3d) is a THIRD "save-version" kind - a
    // teleprompter script is instructor material, and posting it would
    // publish the instructor's spoken lines to students (S4/scriptsKindConfig's
    // own comment, kinds.ts), so it stays false alongside qa/currentEvents/decks.
    expect(kindOffersPost("scripts")).toBe(false);
    expect(kindOffersPost("objectives")).toBe(true);
    expect(kindOffersPost("assignments")).toBe(true);
    expect(kindOffersPost("knowledgeChecks")).toBe(true);
    expect(kindOffersPost("announcements")).toBe(true);
    // "resources" (docs/learning-resources-page-acceptance-criteria.md, A3)
    // is the fifth save-and-post kind - without this line, nothing asserted
    // that posting is even offered for it (finding 5).
    expect(kindOffersPost("resources")).toBe(true);
    // "introDiscussion" (docs/intro-discussion-from-modules-acceptance-
    // criteria.md) is the sixth save-and-post kind - the graded discussion
    // this chunk adds. Without this line, nothing asserted that posting is
    // even offered for it, the same gap "resources" closed above.
    expect(kindOffersPost("introDiscussion")).toBe(true);
  });
});

// E12 (chunk 3e, docs/generated-artifact-editing-acceptance-criteria.md):
// editSuccessNote's own version of the generationSuccessNote/refineSuccessNote
// split above - pinning the FACTS (kind, version, the Canvas claim, and that
// it never misattributes hand-written text to a model), not the exact prose,
// per this repo's own source-text-tests-overspecify lesson.
describe("editSuccessNote", () => {
  it("names the kind and the new version, and states plainly that Canvas was not touched, for a kind that never offers posting", () => {
    const note = editSuccessNote("qa", 3);
    expect(note).toContain("Anticipated lecture Q&A");
    expect(note).toContain("3");
    expect(note).toContain("nothing was written to Canvas");
  });

  it("never claims a model produced the text - 'saved your edit', not 'generated'/'created a new version from your instructions'", () => {
    // SABOTAGE-CHECKABLE: this is the one place this note's wording MUST
    // diverge from generationSuccessNote/refineSuccessNote - an edit is
    // instructor-authored text, and misattributing it would be worse than a
    // cosmetic difference.
    const note = editSuccessNote("scripts", 2);
    expect(note.toLowerCase()).toContain("your edit");
    expect(note).not.toContain("Generated ");
    expect(note).not.toContain("from your instructions");
  });

  it("a save-and-post kind's edit note points at posting as the next step, without claiming nothing was written - same split as the two notes above", () => {
    const note = editSuccessNote("objectives", 4);
    expect(note).toContain("Module objectives");
    expect(note).toContain("4");
    expect(note).toContain("Post to Canvas");
    expect(note).not.toContain("nothing was written to Canvas");
  });

  it("a save-and-post kind whose text CAN still be edited (assignments has no renderStructured) gets the same posting reminder", () => {
    // kindSupportsTextEdit and kindOffersPost are independent gates
    // (kinds.ts): three of the four save-and-post kinds - objectives,
    // assignments, announcements - have no `renderStructured` and so support
    // BOTH at once; only "knowledgeChecks" fails kindSupportsTextEdit (its
    // `structured` payload is authoritative). "assignments" is a live
    // example of the overlap.
    const note = editSuccessNote("assignments", 6);
    expect(note).toContain("Assignment");
    expect(note).toContain("6");
    expect(note).toContain("Post to Canvas");
  });
});

describe("previewMetaText", () => {
  it("keeps the exact original sentence for a save-version kind", () => {
    expect(previewMetaText("currentEvents", 3)).toBe(
      "Version 3 - saved to this course's generated content. Nothing was written to Canvas."
    );
  });

  it("names posting as a separate step for a save-and-post kind, without claiming a fixed Canvas state", () => {
    const text = previewMetaText("knowledgeChecks", 1);
    expect(text).toContain("Version 1");
    expect(text).not.toContain("Nothing was written to Canvas");
  });
});

describe("postResultNote (P4)", () => {
  function summary(overrides: Partial<PostSummary>): PostSummary {
    return { status: "success", text: "Page \"Week 3 Objectives\" posted successfully.", ...overrides };
  }

  it("a true success gets kind 'success'", () => {
    expect(postResultNote(summary({ status: "success", text: "Posted." }))).toEqual({
      kind: "success",
      text: "Posted.",
    });
  });

  it("SABOTAGE TARGET: a PARTIAL result gets kind 'error', never 'success' - the orphan case must not read as a clean success", () => {
    const partial = summary({
      status: "partial",
      text: 'Page "Week 3 Objectives" was created but not linked into the module - find it in Canvas.',
    });
    const result = postResultNote(partial);
    expect(result.kind).toBe("error");
    // Never a BARE failure either - the text still names what was created.
    expect(result.text).toContain("Week 3 Objectives");
  });

  it("a total failure also gets kind 'error'", () => {
    expect(postResultNote(summary({ status: "failed", text: "Nothing was posted." }))).toEqual({
      kind: "error",
      text: "Nothing was posted.",
    });
  });

  // W6 (docs/intro-discussion-from-modules-acceptance-criteria.md, section
  // 5b): `notes` is a NEW, optional second parameter - every caller that
  // predates this feature (and every "save-and-post" kind whose action
  // response carries no `notes`) must get a BYTE-IDENTICAL `text` to before.
  it("FROZEN LITERAL: calling with no notes argument returns byte-identical text to before this parameter existed", () => {
    expect(postResultNote(summary({ status: "success", text: 'Page "Week 3 Objectives" posted successfully.' }))).toEqual(
      { kind: "success", text: 'Page "Week 3 Objectives" posted successfully.' }
    );
  });

  it("an empty notes array is the same as omitting the argument entirely - no trailing separator", () => {
    expect(postResultNote(summary({ text: "Posted." }), [])).toEqual({ kind: "success", text: "Posted." });
  });

  it("SABOTAGE TARGET: appends notes, in order, after summary.text - and the kind rule (P4) is unchanged by their presence", () => {
    const result = postResultNote(
      summary({ status: "success", text: "Discussion \"Introduce yourself\" posted successfully." }),
      ["Initial post due Thursday, September 10, 2026 at 11:59 PM.", "Replies due Sunday, September 13, 2026 at 11:59 PM."]
    );
    expect(result).toEqual({
      kind: "success",
      text:
        'Discussion "Introduce yourself" posted successfully. Initial post due Thursday, September 10, 2026 at 11:59 PM. Replies due Sunday, September 13, 2026 at 11:59 PM.',
    });
    // The kind rule (success/partial/failed -> success/error/error) still
    // applies with notes present - a partial result is not laundered into a
    // clean success just because it also carries extra notes.
    const partialWithNotes = postResultNote(
      summary({ status: "partial", text: "Created but not linked." }),
      ["No due or lock dates were set on the discussion."]
    );
    expect(partialWithNotes.kind).toBe("error");
    expect(partialWithNotes.text).toBe("Created but not linked. No due or lock dates were set on the discussion.");
  });

  // AC21/D5 item 7: "no course start date" and "module name carries no week
  // number" must never collapse into one indistinguishable message. This
  // pins the CHANNEL this file owns (postResultNote must actually carry
  // whatever distinct reason it is given through to the final note text,
  // rather than only ever emitting one fixed sentence regardless of what is
  // passed) - the reasons THEMSELVES are describeMissingDeadlines' own
  // contract (intro-discussion-deadlines.ts, a sibling-owned leaf).
  // Finding 10 (fix): pinned against the REAL leaf function, not hand-invented text.
  it("the two distinct no-deadline reasons produce two DIFFERENT note texts, using the REAL describeMissingDeadlines wording", () => {
    const noStartDateReason = describeMissingDeadlines({ startDate: "", moduleName: "Module 1" })!;
    const noWeekNumberReason = describeMissingDeadlines({ startDate: "2026-01-05", moduleName: "Course Resources" })!;
    expect(noStartDateReason).toBe("This course has no start date, so no due or lock dates were set on the discussion.");
    expect(noWeekNumberReason).toBe('The module name "Course Resources" carries no week number, so no due or lock dates were set on the discussion.');

    const noStartDate = postResultNote(summary({ status: "success" }), [noStartDateReason]);
    const noWeekNumber = postResultNote(summary({ status: "success" }), [noWeekNumberReason]);
    expect(noStartDate.text).not.toBe(noWeekNumber.text);
  });
});

describe("versionOptionLabel", () => {
  it("marks the current version and uses a deterministic date slice", () => {
    expect(
      versionOptionLabel({ version: 3, isCurrent: true, createdAt: "2026-08-11T14:32:00.000Z", title: null })
    ).toBe("v3 (current) - 2026-08-11");
  });

  it("omits the current marker for a superseded version", () => {
    expect(
      versionOptionLabel({ version: 2, isCurrent: false, createdAt: "2026-08-10T09:00:00.000Z", title: null })
    ).toBe("v2 - 2026-08-10");
  });

  // DEFECT FIX (the "scripts" re-gear from lecture script to intro video
  // script kept artifactKind unchanged so old and new versions share one
  // history/picker): title is the ONE field that still tells the two kinds'
  // saved documents apart, so it must be visible in the option label, not
  // only in the artifact row.
  it("SABOTAGE TARGET: appends a non-blank title after the version/date pair", () => {
    expect(
      versionOptionLabel({
        version: 2,
        isCurrent: true,
        createdAt: "2026-08-11T14:32:00.000Z",
        title: "Week 2 Lecture Script",
      })
    ).toBe("v2 (current) - 2026-08-11 - Week 2 Lecture Script");
    expect(
      versionOptionLabel({
        version: 4,
        isCurrent: false,
        createdAt: "2026-08-12T09:00:00.000Z",
        title: "Week 2 Intro Video Script",
      })
    ).toBe("v4 - 2026-08-12 - Week 2 Intro Video Script");
  });

  it("omits the title suffix entirely for null or blank titles - never a dangling separator or bare dash", () => {
    const base = { version: 1, isCurrent: false, createdAt: "2026-08-10T09:00:00.000Z" };
    expect(versionOptionLabel({ ...base, title: null })).toBe("v1 - 2026-08-10");
    expect(versionOptionLabel({ ...base, title: "" })).toBe("v1 - 2026-08-10");
    expect(versionOptionLabel({ ...base, title: "   " })).toBe("v1 - 2026-08-10");
  });
});
