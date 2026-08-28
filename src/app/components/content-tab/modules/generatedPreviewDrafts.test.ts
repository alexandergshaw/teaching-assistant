import { describe, expect, it } from "vitest";
import { draftsDirty, draftsNeedReseed } from "./generatedPreviewDrafts";

describe("draftsNeedReseed", () => {
  it("is false when neither field moved", () => {
    expect(draftsNeedReseed({ text: "a", title: "A" }, { text: "a", title: "A" })).toBe(false);
  });

  it("is true when only the text moved", () => {
    expect(draftsNeedReseed({ text: "b", title: "A" }, { text: "a", title: "A" })).toBe(true);
  });

  it("is true when only the title moved - the AC 8a case: identical text, different title", () => {
    // AC B7 permits saving with ONLY the subject changed, producing two
    // versions with identical text and different titles. A reseed trigger
    // that compared text alone would miss exactly this transition, leaving
    // the subject field showing the OTHER version's title (REGRESSION entry
    // 312 check 7's failure, reached through the picker). Sabotage target 1:
    // reverting this predicate to text-only comparison must turn this test
    // red.
    expect(draftsNeedReseed({ text: "a", title: "B" }, { text: "a", title: "A" })).toBe(true);
  });

  it("is true when both fields moved", () => {
    expect(draftsNeedReseed({ text: "b", title: "B" }, { text: "a", title: "A" })).toBe(true);
  });
});

describe("draftsDirty", () => {
  it("is true when the body text differs from the saved text, regardless of offersTitle", () => {
    expect(draftsDirty({ text: "b", title: "A" }, { text: "a", title: "A" }, false)).toBe(true);
    expect(draftsDirty({ text: "b", title: "A" }, { text: "a", title: "A" }, true)).toBe(true);
  });

  it("ignores a title difference when the subject field is not offered", () => {
    // A kind with no editable subject never diverges its title draft by
    // instructor action; comparing it anyway would risk a false "dirty" the
    // moment two versions' titles differ for a reason unrelated to an edit.
    expect(draftsDirty({ text: "a", title: "B" }, { text: "a", title: "A" }, false)).toBe(false);
  });

  it("is true on a title-only change when the subject field IS offered - saving the subject alone must work (AC B7)", () => {
    expect(draftsDirty({ text: "a", title: "B" }, { text: "a", title: "A" }, true)).toBe(true);
  });

  it("is false when nothing differs, whether or not the subject field is offered", () => {
    expect(draftsDirty({ text: "a", title: "A" }, { text: "a", title: "A" }, false)).toBe(false);
    expect(draftsDirty({ text: "a", title: "A" }, { text: "a", title: "A" }, true)).toBe(false);
  });

  it("is true when both fields differ and the subject field is offered", () => {
    expect(draftsDirty({ text: "b", title: "B" }, { text: "a", title: "A" }, true)).toBe(true);
  });
});
