// vitest is node-env and renders no component (see AGENTS.md / the repo's
// own testing conventions) - this pure module is the actual deliverable this
// chunk is judged on, so every subject, both failure shapes, the priority
// between them, the field-omission table and the degraded-row note are
// covered directly rather than through any component.

import { describe, expect, it } from "vitest";
import {
  LIVE_CONTENT_SOURCE,
  describeCartridgeUploadOnExport,
  describeDegradedItemRow,
  fieldAvailable,
  gateCartridgeUpload,
  gateOperation,
  type ContentSourceContext,
  type GatedField,
  type GatedSubject,
} from "./contentSourceGating";

const ALL_SUBJECTS: GatedSubject[] = ["item", "page", "addItem", "items", "modules", "courseWrite", "files", "assignments", "quizzes"];
const ALL_FIELDS: GatedField[] = ["published", "dueAt", "pointsPossible", "indent"];

const live: ContentSourceContext = { source: "canvas", hasLiveCourse: true };
const exportLinked: ContentSourceContext = { source: "export", hasLiveCourse: true };
const exportUnlinked: ContentSourceContext = { source: "export", hasLiveCourse: false };
const liveUnlinked: ContentSourceContext = { source: "canvas", hasLiveCourse: false };

describe("gateOperation", () => {
  it("allows every subject on a live, linked course - the default before any picker exists", () => {
    for (const subject of ALL_SUBJECTS) {
      expect(gateOperation(live, subject)).toEqual({ allowed: true });
    }
  });

  it("LIVE_CONTENT_SOURCE itself allows every subject - every call site that omits a context prop gets this", () => {
    for (const subject of ALL_SUBJECTS) {
      expect(gateOperation(LIVE_CONTENT_SOURCE, subject)).toEqual({ allowed: true });
    }
  });

  it("blocks every subject when there is no live course at all - shape (ii)", () => {
    for (const subject of ALL_SUBJECTS) {
      const gate = gateOperation(liveUnlinked, subject);
      expect(gate.allowed).toBe(false);
      expect(gate.reason).toBeTruthy();
    }
  });

  it("blocks every subject when viewing an export, even with a live course also linked - shape (i)", () => {
    for (const subject of ALL_SUBJECTS) {
      const gate = gateOperation(exportLinked, subject);
      expect(gate.allowed).toBe(false);
      expect(gate.reason).toBeTruthy();
    }
  });

  it("shapes (i) and (ii) produce DIFFERENT wording for the same subject - never one blanket message", () => {
    for (const subject of ALL_SUBJECTS) {
      const noCourseReason = gateOperation(liveUnlinked, subject).reason;
      const exportReason = gateOperation(exportLinked, subject).reason;
      expect(noCourseReason).not.toBe(exportReason);
    }
  });

  it("no-live-course wording never claims the block is about a stored export", () => {
    for (const subject of ALL_SUBJECTS) {
      const reason = gateOperation(liveUnlinked, subject).reason ?? "";
      expect(reason.toLowerCase()).not.toContain("export");
    }
  });

  it("export-identity wording never claims there is no live course", () => {
    for (const subject of ALL_SUBJECTS) {
      const reason = gateOperation(exportLinked, subject).reason ?? "";
      expect(reason.toLowerCase()).not.toContain("no live canvas course");
    }
  });

  it("THE PRIORITY RULE: with BOTH facts failing, the no-live-course reason wins, not the export one", () => {
    for (const subject of ALL_SUBJECTS) {
      const gate = gateOperation(exportUnlinked, subject);
      const noCourseReason = gateOperation(liveUnlinked, subject).reason;
      const exportReason = gateOperation(exportLinked, subject).reason;
      expect(gate.reason).toBe(noCourseReason);
      expect(gate.reason).not.toBe(exportReason);
    }
  });

  it("every subject has a distinct pair of reasons - no copy-pasted wording across unrelated controls", () => {
    const noCourseReasons = new Set(ALL_SUBJECTS.map((s) => gateOperation(liveUnlinked, s).reason));
    const exportReasons = new Set(ALL_SUBJECTS.map((s) => gateOperation(exportLinked, s).reason));
    expect(noCourseReasons.size).toBe(ALL_SUBJECTS.length);
    expect(exportReasons.size).toBe(ALL_SUBJECTS.length);
  });
});

describe("fieldAvailable", () => {
  it("is true for every gated field on the live source", () => {
    for (const field of ALL_FIELDS) {
      expect(fieldAvailable("canvas", field)).toBe(true);
    }
  });

  it("is false for every gated field on the export source - none of the four exist in the format at all", () => {
    for (const field of ALL_FIELDS) {
      expect(fieldAvailable("export", field)).toBe(false);
    }
  });
});

describe("describeDegradedItemRow - failure shape (iii), WORKS DEGRADED", () => {
  it("is null on the live source - nothing degraded to announce", () => {
    expect(describeDegradedItemRow(live)).toBeNull();
  });

  it("is null on the live source even with no live course linked - that combination cannot arise from a real picker, but the function still only reads `source`", () => {
    expect(describeDegradedItemRow(liveUnlinked)).toBeNull();
  });

  it("is a non-empty note on the export source, regardless of hasLiveCourse", () => {
    expect(describeDegradedItemRow(exportLinked)).toBeTruthy();
    expect(describeDegradedItemRow(exportUnlinked)).toBeTruthy();
    expect(describeDegradedItemRow(exportLinked)).toBe(describeDegradedItemRow(exportUnlinked));
  });

  it("says what IS shown, not just what isn't - distinguishing it from a plain blocked-reason string", () => {
    const note = describeDegradedItemRow(exportLinked) ?? "";
    expect(note.toLowerCase()).toContain("title");
  });
});

describe("gateCartridgeUpload - AC4: gated on hasLiveCourse ALONE, never on source", () => {
  it("allows on the live source with a live course - unchanged baseline", () => {
    expect(gateCartridgeUpload(live)).toEqual({ allowed: true });
  });

  it("THE REACHABILITY CASE: allows on the export source, as long as a live course is linked - " +
    "pushing the export you're viewing into the live course is the feature's whole point", () => {
    expect(gateCartridgeUpload(exportLinked)).toEqual({ allowed: true });
  });

  it("blocks when there is no live course at all, live source", () => {
    const gate = gateCartridgeUpload(liveUnlinked);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBeTruthy();
  });

  it("blocks when there is no live course at all, export source - same fact, same block", () => {
    const gate = gateCartridgeUpload(exportUnlinked);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBeTruthy();
  });

  it("never blocks purely because source is export - the ONE thing distinguishing it from gateOperation('courseWrite')", () => {
    // Sanity check on the contrast this function exists to break: an ordinary
    // courseWrite IS blocked on an export source with a live course linked...
    expect(gateOperation(exportLinked, "courseWrite").allowed).toBe(false);
    // ...but gateCartridgeUpload is not, for the identical ctx.
    expect(gateCartridgeUpload(exportLinked).allowed).toBe(true);
  });

  it("reuses gateOperation's own no-live-course sentence verbatim - never a second, driftable string", () => {
    expect(gateCartridgeUpload(liveUnlinked).reason).toBe(gateOperation(liveUnlinked, "courseWrite").reason);
    expect(gateCartridgeUpload(exportUnlinked).reason).toBe(gateOperation(liveUnlinked, "courseWrite").reason);
  });

  it("the blocked reason never claims the block is about a stored export", () => {
    const reason = gateCartridgeUpload(liveUnlinked).reason ?? "";
    expect(reason.toLowerCase()).not.toContain("export");
  });
});

describe("describeCartridgeUploadOnExport - AC20's expectation-setting note", () => {
  it("is null on the live source, regardless of hasLiveCourse", () => {
    expect(describeCartridgeUploadOnExport(live)).toBeNull();
    expect(describeCartridgeUploadOnExport(liveUnlinked)).toBeNull();
  });

  it("is a non-empty sentence on the export source, regardless of hasLiveCourse", () => {
    expect(describeCartridgeUploadOnExport(exportLinked)).toBeTruthy();
    expect(describeCartridgeUploadOnExport(exportUnlinked)).toBeTruthy();
    expect(describeCartridgeUploadOnExport(exportLinked)).toBe(describeCartridgeUploadOnExport(exportUnlinked));
  });

  it("names the live Canvas course as the destination - not worded as a blocked-reason string", () => {
    const note = describeCartridgeUploadOnExport(exportLinked) ?? "";
    expect(note.toLowerCase()).toContain("live canvas course");
  });
});
