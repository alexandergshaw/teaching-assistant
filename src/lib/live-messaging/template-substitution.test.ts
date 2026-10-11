import { describe, it, expect } from "vitest";
import {
  parseCanvasName,
  neutraliseValue,
  renderTemplate,
  renderForStudents,
  isSendable,
  type StudentTokenValues,
} from "./template-substitution";

function values(over: Partial<StudentTokenValues> = {}): StudentTokenValues {
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    course: "CS 101",
    section: "Section A",
    missingCount: 2,
    grade: 87.5,
    ...over,
  };
}

const BODY =
  "Hi {{first_name}} {{last_name}}, in {{course}} ({{section}}) you have {{#_missing_assignments}} missing and a {{grade}}.";

describe("parseCanvasName", () => {
  it("parses 'Last, First'", () => {
    expect(parseCanvasName("Lovelace, Ada", "Ada Lovelace")).toEqual({ firstName: "Ada", lastName: "Lovelace" });
  });
  it("keeps a multi-part given name whole", () => {
    expect(parseCanvasName("Smith, Mary Ann", "Mary Ann Smith")).toEqual({ firstName: "Mary Ann", lastName: "Smith" });
  });
  it("does not swallow a trailing suffix after a second comma", () => {
    expect(parseCanvasName("Smith, John, Jr.", "John Smith Jr.")).toEqual({ firstName: "John", lastName: "Smith" });
  });
  it("falls back to the display name when there is no sortable name", () => {
    expect(parseCanvasName("", "Grace Brewster Hopper")).toEqual({ firstName: "Grace Brewster", lastName: "Hopper" });
  });
  it("treats a single-token name as a first name with no last name", () => {
    expect(parseCanvasName("Cher", "Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
  it("returns empty parts for no name at all", () => {
    expect(parseCanvasName(null, undefined)).toEqual({ firstName: "", lastName: "" });
  });
});

describe("renderTemplate", () => {
  it("substitutes all six tokens", () => {
    const r = renderTemplate(BODY, values());
    expect(r.text).toBe("Hi Ada Lovelace, in CS 101 (Section A) you have 2 missing and a 87.5%.");
    expect(r.unresolved).toEqual([]);
    expect(r.unknown).toEqual([]);
    expect(isSendable(r)).toBe(true);
  });

  it("tolerates whitespace inside the braces and repeated tokens", () => {
    const r = renderTemplate("{{ first_name }} / {{first_name}}", values());
    expect(r.text).toBe("Ada / Ada");
  });

  it("renders a zero missing count as 0, not as missing", () => {
    const r = renderTemplate("{{#_missing_assignments}}", values({ missingCount: 0 }));
    expect(r.text).toBe("0");
    expect(r.unresolved).toEqual([]);
  });

  it("renders a known token with no value as empty and reports it, never as undefined", () => {
    const r = renderTemplate("Grade: {{grade}} for {{last_name}}", values({ grade: null, lastName: "" }));
    expect(r.text).toBe("Grade:  for ");
    expect(r.text).not.toContain("undefined");
    expect(r.text).not.toContain("null");
    expect(r.unresolved).toEqual(["grade", "last_name"]);
    expect(isSendable(r)).toBe(false);
  });

  it("leaves an unknown token literally in the text and reports it", () => {
    const r = renderTemplate("Hi {{frist_name}}", values());
    expect(r.text).toBe("Hi {{frist_name}}");
    expect(r.unknown).toEqual(["frist_name"]);
    expect(isSendable(r)).toBe(false);
  });

  it("does not let a value inject template syntax or expand a token", () => {
    const r = renderTemplate("Hi {{first_name}}, {{grade}}", values({ firstName: "{{grade}}Eve{{course}}" }));
    expect(r.text).toBe("Hi gradeEvecourse, 87.5%");
    expect(r.text).not.toContain("{");
  });

  it("treats replacement patterns in a value as inert text", () => {
    const r = renderTemplate("Hi {{first_name}}", values({ firstName: "$& $1 $$" }));
    expect(r.text).toBe("Hi $& $1 $$");
  });

  it("neutralises control characters and bounds value length", () => {
    const nul = String.fromCharCode(0);
    const tab = String.fromCharCode(9);
    expect(neutraliseValue("a" + nul + "b" + tab + "c")).toBe("a b c");
    expect(neutraliseValue("x".repeat(500))).toHaveLength(200);
  });

  it("treats a non-finite grade as missing", () => {
    const r = renderTemplate("{{grade}}", values({ grade: Number.NaN }));
    expect(r.unresolved).toEqual(["grade"]);
  });
});

describe("renderForStudents - the per-student attribution guarantee", () => {
  // The two students DIFFER at every bound token. If they shared a value the
  // 'bodies differ' assertion below would be vacuous.
  const ada = values();
  const grace = values({
    firstName: "Grace",
    lastName: "Hopper",
    course: "CS 202",
    section: "Section B",
    missingCount: 7,
    grade: 61,
  });

  it("gives two students with different live values different bodies, each with its own values", () => {
    const [a, g] = renderForStudents("Update for {{first_name}}", BODY, [
      { key: "a", values: ada },
      { key: "g", values: grace },
    ]);
    expect(a.body.text).not.toBe(g.body.text);
    expect(a.subject.text).toBe("Update for Ada");
    expect(g.subject.text).toBe("Update for Grace");
    expect(a.body.text).toContain("2 missing");
    expect(a.body.text).toContain("87.5%");
    expect(a.body.text).toContain("CS 101");
    expect(g.body.text).toContain("7 missing");
    expect(g.body.text).toContain("61%");
    expect(g.body.text).toContain("CS 202");
    // No cross-contamination.
    expect(a.body.text).not.toContain("61%");
    expect(g.body.text).not.toContain("87.5%");
    expect(g.body.text).not.toContain("Ada");
  });

  it("preserves the key and order of the input", () => {
    const out = renderForStudents("s", "b", [
      { key: "z", values: ada },
      { key: "y", values: grace },
    ]);
    expect(out.map((o) => o.key)).toEqual(["z", "y"]);
  });
});
