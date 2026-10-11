import { describe, expect, it } from "vitest";
import type { EnrollmentRow } from "./enrollment-aggregator";
import { insertAtSelection, rowToTokenValues, tokenText } from "./preview-model";
import { renderForStudents } from "./template-substitution";

function row(over: Partial<EnrollmentRow>): EnrollmentRow {
  return {
    key: "MCC:1::10",
    institution: "MCC",
    courseId: "1",
    course: "Biology 101",
    term: "Fall",
    sectionId: null,
    section: "",
    userId: "10",
    name: "Ada Lovelace",
    firstName: "Ada",
    lastName: "Lovelace",
    grade: 91.5,
    missingCount: 2,
    ...over,
  };
}

describe("rowToTokenValues", () => {
  it("maps a row onto the L6 token values", () => {
    expect(rowToTokenValues(row({ section: "Sec A" }))).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      course: "Biology 101",
      section: "Sec A",
      missingCount: 2,
      grade: 91.5,
    });
  });

  it("turns blank strings into null so the token is reported unresolved", () => {
    const values = rowToTokenValues(row({ section: "", lastName: "" }));
    expect(values.section).toBeNull();
    expect(values.lastName).toBeNull();
  });

  it("feeds renderForStudents so two rows render their OWN values", () => {
    const a = row({ key: "a", grade: 90, missingCount: 0 });
    const b = row({ key: "b", name: "Bo Li", firstName: "Bo", grade: 40, missingCount: 7 });
    const out = renderForStudents("Hi {{first_name}}", "{{grade}} / {{#_missing_assignments}}", [
      { key: a.key, values: rowToTokenValues(a) },
      { key: b.key, values: rowToTokenValues(b) },
    ]);
    expect(out[0].subject.text).toBe("Hi Ada");
    expect(out[1].subject.text).toBe("Hi Bo");
    expect(out[0].body.text).not.toBe(out[1].body.text);
  });
});

describe("tokenText / insertAtSelection", () => {
  it("wraps a token in double braces", () => {
    expect(tokenText("first_name")).toBe("{{first_name}}");
  });

  it("inserts at the caret and returns the new caret", () => {
    expect(insertAtSelection("Hello !", "{{first_name}}", 6, 6)).toEqual({
      text: "Hello {{first_name}}!",
      caret: 6 + "{{first_name}}".length,
    });
  });

  it("replaces a selection, tolerating reversed and out-of-range offsets", () => {
    expect(insertAtSelection("abcdef", "X", 4, 2).text).toBe("abXef");
    expect(insertAtSelection("abc", "X", 99, 99).text).toBe("abcX");
    expect(insertAtSelection("abc", "X", -5, 1).text).toBe("Xbc");
    expect(insertAtSelection("abc", "X", Number.NaN, Number.NaN).text).toBe("abcX");
  });
});
