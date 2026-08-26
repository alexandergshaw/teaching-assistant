import { describe, expect, it } from "vitest";
import {
  buildRepoGradeRubricOptions,
  describeRepoGradeColumnRubric,
  describeRepoGradeExportRubricEmptiness,
  describeRepoGradeLiveRubricEmptiness,
  parseRepoGradeRubricValue,
  resolveStoredRepoGradeRubricChoice,
  type RepoGradeExportRubricInput,
  type RepoGradeLiveRubricInput,
  type RepoGradeRubricOption,
} from "./repoGradesRubricSource";

// ── buildRepoGradeRubricOptions ─────────────────────────────────────────────

describe("buildRepoGradeRubricOptions", () => {
  it("with no live/export input, returns only the three fixed slots in order", () => {
    const result = buildRepoGradeRubricOptions({ live: [], export: [] });
    expect(result).toEqual([
      { value: "generate", label: "Generate from the instructions", source: "generate", group: null, mayNotResolve: false },
      { value: "assignment", label: "Use the mapped assignment's rubric", source: "assignment", group: null, mayNotResolve: false },
      { value: "manual", label: "Type my own", source: "manual", group: null, mayNotResolve: false },
    ]);
  });

  it("orders generate, assignment, live (by title), export (by title), manual", () => {
    const result = buildRepoGradeRubricOptions({
      live: [
        { id: 200, title: "Zebra Rubric", source: "course" },
        { id: 199, title: "Alpha Rubric", source: "course" },
      ],
      export: [
        { title: "Export Zebra" },
        { title: "Export Alpha" },
      ],
    });
    expect(result.map((o) => o.source)).toEqual([
      "generate",
      "assignment",
      "live",
      "live",
      "export",
      "export",
      "manual",
    ]);
    // Live and export blocks are each sorted by title, independent of input order.
    expect(result.map((o) => o.label)).toEqual([
      "Generate from the instructions",
      "Use the mapped assignment's rubric",
      "Alpha Rubric",
      "Zebra Rubric",
      "Export Alpha (from export)",
      "Export Zebra (from export)",
      "Type my own",
    ]);
  });

  it("builds a live option's value from the bare id under the live: prefix, with a stable optgroup label", () => {
    const result = buildRepoGradeRubricOptions({
      live: [{ id: 501, title: "Homework Rubric", source: "course" }],
      export: [],
    });
    const liveOption = result.find((o) => o.source === "live")!;
    expect(liveOption).toEqual({
      value: "live:501",
      label: "Homework Rubric",
      source: "live",
      group: "Live Canvas rubrics",
      mayNotResolve: false,
    });
  });

  it("marks an account-scoped live rubric as mayNotResolve, and a course-scoped one as resolvable", () => {
    const result = buildRepoGradeRubricOptions({
      live: [
        { id: 1, title: "Course Rubric", source: "course" },
        { id: 2, title: "Account Rubric", source: "account" },
      ],
      export: [],
    });
    const course = result.find((o) => o.value === "live:1")!;
    const account = result.find((o) => o.value === "live:2")!;
    expect(course.mayNotResolve).toBe(false);
    expect(account.mayNotResolve).toBe(true);
  });

  it("builds an export option's value from the title under the export: prefix with a 0 occurrence, labelled '(from export)', grouped separately from live", () => {
    const result = buildRepoGradeRubricOptions({
      live: [],
      export: [{ title: "Lab 1" }],
    });
    const exportOption = result.find((o) => o.source === "export")!;
    expect(exportOption).toEqual({
      value: "export:0:Lab 1",
      label: "Lab 1 (from export)",
      source: "export",
      group: "From your course export",
      mayNotResolve: false,
    });
  });

  it("disambiguates duplicate export titles by occurrence index, in original input order", () => {
    const result = buildRepoGradeRubricOptions({
      live: [],
      export: [{ title: "Group Rubric" }, { title: "Other" }, { title: "Group Rubric" }],
    });
    const exportOptions = result.filter((o) => o.source === "export");
    const values = exportOptions.map((o) => o.value).sort();
    expect(values).toEqual(["export:0:Group Rubric", "export:0:Other", "export:1:Group Rubric"]);
    // Every duplicate-titled option still carries the identical, correct label.
    expect(exportOptions.filter((o) => o.value.includes("Group Rubric")).map((o) => o.label)).toEqual([
      "Group Rubric (from export)",
      "Group Rubric (from export)",
    ]);
  });

  it("namespaces a live id and an export title that look identical so they cannot collide as select values", () => {
    const result = buildRepoGradeRubricOptions({
      live: [{ id: 5, title: "Rubric Five", source: "course" }],
      export: [{ title: "5" }],
    });
    const liveOption = result.find((o) => o.source === "live")!;
    const exportOption = result.find((o) => o.source === "export")!;
    // The export item's title is the literal numeral "5", textually
    // identical to the live rubric's numeric id - the namespacing prefix is
    // the only thing keeping these two option values distinct.
    expect(liveOption.value).toBe("live:5");
    expect(exportOption.value).toBe("export:0:5");
    expect(liveOption.value).not.toBe(exportOption.value);
    const values = result.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("never mutates the input arrays", () => {
    const live = Object.freeze([
      { id: 2, title: "B", source: "course" },
      { id: 1, title: "A", source: "course" },
    ]) as readonly RepoGradeLiveRubricInput[];
    const exportItems = Object.freeze([{ title: "Z" }, { title: "A" }]) as readonly RepoGradeExportRubricInput[];
    expect(() => buildRepoGradeRubricOptions({ live, export: exportItems })).not.toThrow();
    expect(live).toEqual([
      { id: 2, title: "B", source: "course" },
      { id: 1, title: "A", source: "course" },
    ]);
    expect(exportItems).toEqual([{ title: "Z" }, { title: "A" }]);
  });

  it("is pure: the same input produces the same output on repeated calls", () => {
    const input = {
      live: [{ id: 1, title: "A", source: "course" as const }],
      export: [{ title: "B" }],
    };
    const first = buildRepoGradeRubricOptions(input);
    const second = buildRepoGradeRubricOptions(input);
    expect(first).toEqual(second);
  });
});

// ── parseRepoGradeRubricValue ───────────────────────────────────────────────

describe("parseRepoGradeRubricValue", () => {
  it("round-trips each fixed sentinel", () => {
    expect(parseRepoGradeRubricValue("generate")).toEqual({ source: "generate" });
    expect(parseRepoGradeRubricValue("assignment")).toEqual({ source: "assignment" });
    expect(parseRepoGradeRubricValue("manual")).toEqual({ source: "manual" });
  });

  it("round-trips a live value back to its bare id", () => {
    expect(parseRepoGradeRubricValue("live:501")).toEqual({ source: "live", id: "501" });
  });

  it("round-trips an export value back to its occurrence and title", () => {
    expect(parseRepoGradeRubricValue("export:0:Lab 1")).toEqual({ source: "export", occurrence: 0, title: "Lab 1" });
    expect(parseRepoGradeRubricValue("export:3:Lab 1")).toEqual({ source: "export", occurrence: 3, title: "Lab 1" });
  });

  it("keeps every colon after the first as part of the export title", () => {
    expect(parseRepoGradeRubricValue("export:0:Lab 1: Setup")).toEqual({
      source: "export",
      occurrence: 0,
      title: "Lab 1: Setup",
    });
  });

  it("returns null for an empty string", () => {
    expect(parseRepoGradeRubricValue("")).toBeNull();
  });

  it("returns null for a whitespace-only value", () => {
    expect(parseRepoGradeRubricValue("   ")).toBeNull();
  });

  it("returns null for a bare live: prefix with nothing after it", () => {
    expect(parseRepoGradeRubricValue("live:")).toBeNull();
  });

  it("returns null for a bare export: prefix with nothing after it", () => {
    expect(parseRepoGradeRubricValue("export:")).toBeNull();
  });

  it("returns null for an export value with no occurrence:title separator", () => {
    expect(parseRepoGradeRubricValue("export:notanumber")).toBeNull();
  });

  it("returns null for an export value with a non-integer occurrence", () => {
    expect(parseRepoGradeRubricValue("export:abc:Lab 1")).toBeNull();
  });

  it("returns null for an export value with a negative occurrence", () => {
    expect(parseRepoGradeRubricValue("export:-1:Lab 1")).toBeNull();
  });

  it("returns null for an export value with an empty title", () => {
    expect(parseRepoGradeRubricValue("export:0:")).toBeNull();
  });

  it("returns null for unrecognized garbage", () => {
    expect(parseRepoGradeRubricValue("not-a-real-source")).toBeNull();
    expect(parseRepoGradeRubricValue("Live:501")).toBeNull(); // case-sensitive: not a match
  });

  it("trims surrounding whitespace off an otherwise-valid value", () => {
    expect(parseRepoGradeRubricValue("  live:501  ")).toEqual({ source: "live", id: "501" });
    expect(parseRepoGradeRubricValue("  generate  ")).toEqual({ source: "generate" });
  });
});

// ── resolveStoredRepoGradeRubricChoice ──────────────────────────────────────

describe("resolveStoredRepoGradeRubricChoice", () => {
  const options: RepoGradeRubricOption[] = buildRepoGradeRubricOptions({
    live: [{ id: 501, title: "Homework Rubric", source: "course" }],
    export: [{ title: "Lab 1" }],
  });

  it("defaults to generate with no reason when nothing was ever stored", () => {
    expect(resolveStoredRepoGradeRubricChoice(null, options)).toEqual({
      value: "generate",
      source: "generate",
      degradedReason: null,
    });
    expect(resolveStoredRepoGradeRubricChoice(undefined, options)).toEqual({
      value: "generate",
      source: "generate",
      degradedReason: null,
    });
    expect(resolveStoredRepoGradeRubricChoice("", options)).toEqual({
      value: "generate",
      source: "generate",
      degradedReason: null,
    });
  });

  it("defaults to generate with no reason for an unparseable stored value (nothing valid was ever chosen)", () => {
    const result = resolveStoredRepoGradeRubricChoice("total-garbage", options);
    expect(result.source).toBe("generate");
    expect(result.degradedReason).toBeNull();
  });

  it("passes through each fixed sentinel unchanged, even with an empty option list", () => {
    expect(resolveStoredRepoGradeRubricChoice("generate", [])).toEqual({
      value: "generate",
      source: "generate",
      degradedReason: null,
    });
    expect(resolveStoredRepoGradeRubricChoice("assignment", [])).toEqual({
      value: "assignment",
      source: "assignment",
      degradedReason: null,
    });
    expect(resolveStoredRepoGradeRubricChoice("manual", [])).toEqual({
      value: "manual",
      source: "manual",
      degradedReason: null,
    });
  });

  it("passes through a live choice that is still listed, unchanged", () => {
    expect(resolveStoredRepoGradeRubricChoice("live:501", options)).toEqual({
      value: "live:501",
      source: "live",
      degradedReason: null,
    });
  });

  it("passes through an export choice that is still listed, unchanged", () => {
    expect(resolveStoredRepoGradeRubricChoice("export:0:Lab 1", options)).toEqual({
      value: "export:0:Lab 1",
      source: "export",
      degradedReason: null,
    });
  });

  it("degrades a stale live choice to generate WITH a stated reason", () => {
    const result = resolveStoredRepoGradeRubricChoice("live:999", options);
    expect(result.value).toBe("generate");
    expect(result.source).toBe("generate");
    expect(result.degradedReason).toBeTruthy();
    expect(result.degradedReason).toMatch(/Canvas rubric/);
  });

  it("degrades a stale export choice to generate WITH a stated reason", () => {
    const result = resolveStoredRepoGradeRubricChoice("export:0:No Longer There", options);
    expect(result.value).toBe("generate");
    expect(result.source).toBe("generate");
    expect(result.degradedReason).toBeTruthy();
    expect(result.degradedReason).toMatch(/export/);
  });

  it("degrades an export choice whose title still exists but whose occurrence index no longer matches", () => {
    // Same title as a real option, but occurrence 1 was never assembled
    // (there is only one "Lab 1" in this fixture, at occurrence 0).
    const result = resolveStoredRepoGradeRubricChoice("export:1:Lab 1", options);
    expect(result.value).toBe("generate");
    expect(result.degradedReason).toBeTruthy();
  });

  // Canary: prove the "silent default" and "reasoned degradation" paths are
  // genuinely distinct code paths, not just two branches that happen to both
  // return generate. If a future edit collapsed them into one shared
  // fallback that always sets (or always omits) a reason, this pair of
  // assertions would catch it.
  it("canary: garbage and a stale-but-well-formed reference produce different degradedReason-ness", () => {
    const garbage = resolveStoredRepoGradeRubricChoice("nonsense", options);
    const stale = resolveStoredRepoGradeRubricChoice("live:999", options);
    expect(garbage.degradedReason).toBeNull();
    expect(stale.degradedReason).not.toBeNull();
  });
});

// ── describeRepoGradeLiveRubricEmptiness / describeRepoGradeExportRubricEmptiness ──

describe("describeRepoGradeLiveRubricEmptiness", () => {
  const oneRubric: RepoGradeLiveRubricInput[] = [{ id: 1, title: "A", source: "course" }];

  it("returns null when the list has items, even if an error is also set (partial load still shows what loaded)", () => {
    expect(
      describeRepoGradeLiveRubricEmptiness({ hasConnection: true, error: "account fetch timed out", items: oneRubric })
    ).toBeNull();
  });

  it("reports not-connected when there is no live LMS connection", () => {
    const result = describeRepoGradeLiveRubricEmptiness({ hasConnection: false, error: null, items: [] });
    expect(result?.reason).toBe("not-connected");
    expect(result?.text).toMatch(/no live LMS connection/);
  });

  it("prioritizes not-connected over a reported error when both are present", () => {
    // Canary: if the priority order were reversed, this would return
    // "load-failed" instead - proving the ordering in the implementation
    // actually matters and is exercised.
    const result = describeRepoGradeLiveRubricEmptiness({
      hasConnection: false,
      error: "some error",
      items: [],
    });
    expect(result?.reason).toBe("not-connected");
  });

  it("reports load-failed when connected but the load errored", () => {
    const result = describeRepoGradeLiveRubricEmptiness({ hasConnection: true, error: "Canvas rejected the request.", items: [] });
    expect(result?.reason).toBe("load-failed");
    expect(result?.text).toContain("Canvas rejected the request.");
  });

  it("reports empty when connected, no error, and the list genuinely has nothing", () => {
    const result = describeRepoGradeLiveRubricEmptiness({ hasConnection: true, error: null, items: [] });
    expect(result?.reason).toBe("empty");
  });
});

describe("describeRepoGradeExportRubricEmptiness", () => {
  const oneRubric: RepoGradeExportRubricInput[] = [{ title: "A" }];

  it("returns null when the list has items", () => {
    expect(describeRepoGradeExportRubricEmptiness({ hasExport: true, error: null, items: oneRubric })).toBeNull();
  });

  it("reports no-export when the course row has no stored export", () => {
    const result = describeRepoGradeExportRubricEmptiness({ hasExport: false, error: null, items: [] });
    expect(result?.reason).toBe("no-export");
    expect(result?.text).toMatch(/no stored export/);
  });

  it("prioritizes no-export over a reported error when both are present", () => {
    const result = describeRepoGradeExportRubricEmptiness({ hasExport: false, error: "some error", items: [] });
    expect(result?.reason).toBe("no-export");
  });

  it("reports load-failed when there is an export but it failed to load", () => {
    const result = describeRepoGradeExportRubricEmptiness({ hasExport: true, error: "network error", items: [] });
    expect(result?.reason).toBe("load-failed");
    expect(result?.text).toContain("network error");
  });

  it("reports empty when there is an export, no error, and it has no rubrics", () => {
    const result = describeRepoGradeExportRubricEmptiness({ hasExport: true, error: null, items: [] });
    expect(result?.reason).toBe("empty");
  });
});

// ── describeRepoGradeColumnRubric ───────────────────────────────────────────

describe("describeRepoGradeColumnRubric", () => {
  it("describes generate", () => {
    expect(
      describeRepoGradeColumnRubric({ source: "generate", chosenLabel: null, columnHasMappedAssignment: false })
    ).toBe("Rubric: generated from the instructions when you grade");
  });

  it("describes manual", () => {
    expect(
      describeRepoGradeColumnRubric({ source: "manual", chosenLabel: null, columnHasMappedAssignment: false })
    ).toBe("Rubric: your typed text");
  });

  it("describes assignment with a mapped column using the exact AC-required wording", () => {
    expect(
      describeRepoGradeColumnRubric({ source: "assignment", chosenLabel: null, columnHasMappedAssignment: true })
    ).toBe("Rubric: this assignment's own, read when you grade");
  });

  it("describes assignment with an UNMAPPED column using the exact AC-required wording", () => {
    expect(
      describeRepoGradeColumnRubric({ source: "assignment", chosenLabel: null, columnHasMappedAssignment: false })
    ).toBe("Rubric: no assignment mapped - one will be generated");
  });

  it("describes live using the chosen rubric's title, unmodified", () => {
    expect(
      describeRepoGradeColumnRubric({ source: "live", chosenLabel: "Homework Rubric", columnHasMappedAssignment: false })
    ).toBe("Rubric: Homework Rubric");
  });

  it("describes export with the chosen rubric's title plus the (from export) marker", () => {
    expect(
      describeRepoGradeColumnRubric({ source: "export", chosenLabel: "Lab 1", columnHasMappedAssignment: false })
    ).toBe("Rubric: Lab 1 (from export)");
  });

  it("falls back to a generic noun when chosenLabel is null for live/export, rather than rendering 'Rubric: null'", () => {
    const live = describeRepoGradeColumnRubric({ source: "live", chosenLabel: null, columnHasMappedAssignment: false });
    const exported = describeRepoGradeColumnRubric({ source: "export", chosenLabel: null, columnHasMappedAssignment: false });
    expect(live).not.toContain("null");
    expect(exported).not.toContain("null");
    expect(exported).toContain("(from export)");
  });

  it("is pure: the same input produces the same output", () => {
    const input = { source: "export" as const, chosenLabel: "Lab 1", columnHasMappedAssignment: false };
    expect(describeRepoGradeColumnRubric(input)).toBe(describeRepoGradeColumnRubric(input));
  });
});
