// Coverage for src/lib/courses-table-labels.ts, which previously had none.
//
// This module was written by a different model than the rest of this test
// suite. Its own doc comments describe intended behavior; where a comment
// and the actual code disagree, these tests assert what the CODE does, and
// any discrepancy is called out in the handoff report rather than "fixed"
// here.
import { describe, it, expect } from "vitest";
import { ALL_COLUMN_IDS } from "./courses-table-helpers";
import {
  CELL_COLUMN_LABELS,
  MODALITY_OPTIONS,
  EMAIL_CLIENT_OPTIONS,
  modalityLabel,
  emailClientLabel,
  type CellColumnId,
} from "./courses-table-labels";

describe("CELL_COLUMN_LABELS - canary", () => {
  it("has exactly the key set name + every ALL_COLUMN_IDS entry", () => {
    const expectedKeys = ["name", ...ALL_COLUMN_IDS].sort();
    const actualKeys = Object.keys(CELL_COLUMN_LABELS).sort();
    // A column added to ALL_COLUMN_IDS without a matching CELL_COLUMN_LABELS
    // entry (or vice versa) must fail here, not surface as a blank column
    // header at runtime.
    expect(actualKeys).toEqual(expectedKeys);
  });

  it("gives every column a non-empty label", () => {
    for (const key of Object.keys(CELL_COLUMN_LABELS) as CellColumnId[]) {
      const label = CELL_COLUMN_LABELS[key];
      expect(typeof label, `${key} label is not a string`).toBe("string");
      expect(label.trim().length, `${key} has an empty label`).toBeGreaterThan(0);
    }
  });
});

describe("CELL_COLUMN_LABELS - frozen literals for the easy-to-get-wrong labels", () => {
  it("name -> Name", () => {
    expect(CELL_COLUMN_LABELS.name).toBe("Name");
  });

  it("githubOrg -> Organization", () => {
    expect(CELL_COLUMN_LABELS.githubOrg).toBe("Organization");
  });

  it("syllabusId -> Syllabus", () => {
    expect(CELL_COLUMN_LABELS.syllabusId).toBe("Syllabus");
  });

  it("scheduleCsv -> Schedule of Topics", () => {
    expect(CELL_COLUMN_LABELS.scheduleCsv).toBe("Schedule of Topics");
  });

  it("weeklyChecklist -> Checklist (deliberate rename; the key keeps 'weekly', the label must not)", () => {
    expect(CELL_COLUMN_LABELS.weeklyChecklist).toBe("Checklist");
  });
});

describe("modalityLabel", () => {
  it("resolves the two known codes to their display labels", () => {
    expect(modalityLabel("async")).toBe("Asynchronous");
    expect(modalityLabel("sync")).toBe("Synchronous");
  });

  it("null / undefined / empty string all resolve to empty string", () => {
    expect(modalityLabel(null)).toBe("");
    expect(modalityLabel(undefined)).toBe("");
    expect(modalityLabel("")).toBe("");
  });

  it("an unrecognized stored value passes through unchanged", () => {
    expect(modalityLabel("hybrid")).toBe("hybrid");
  });

  it("trims surrounding whitespace before resolving", () => {
    expect(modalityLabel("  async  ")).toBe("Asynchronous");
    expect(modalityLabel("  sync\t")).toBe("Synchronous");
  });

  it("trims surrounding whitespace on an unrecognized value too, returning the trimmed form", () => {
    expect(modalityLabel("  hybrid  ")).toBe("hybrid");
  });

  it("whitespace-only input resolves to empty string, same as unset", () => {
    expect(modalityLabel("   ")).toBe("");
  });
});

describe("emailClientLabel", () => {
  it("resolves the three known codes to their display labels", () => {
    expect(emailClientLabel("outlook")).toBe("Outlook");
    expect(emailClientLabel("gmail")).toBe("Gmail");
    expect(emailClientLabel("other")).toBe("Other");
  });

  it("null / undefined / empty string all resolve to empty string", () => {
    expect(emailClientLabel(null)).toBe("");
    expect(emailClientLabel(undefined)).toBe("");
    expect(emailClientLabel("")).toBe("");
  });

  it("an unrecognized stored value passes through unchanged", () => {
    expect(emailClientLabel("protonmail")).toBe("protonmail");
  });

  it("trims surrounding whitespace before resolving", () => {
    expect(emailClientLabel("  outlook  ")).toBe("Outlook");
  });

  it("trims surrounding whitespace on an unrecognized value too, returning the trimmed form", () => {
    expect(emailClientLabel("  protonmail  ")).toBe("protonmail");
  });
});

describe("drift guard - options list and label resolver can never disagree", () => {
  // Hand-written FROZEN LITERAL pairings, not derived from MODALITY_OPTIONS /
  // EMAIL_CLIENT_OPTIONS or from modalityLabel/emailClientLabel themselves.
  // The previous version of this guard asserted modalityLabel(opt.value) ===
  // opt.label using MODALITY_OPTIONS' OWN entries on both sides - but
  // MODALITY_LABEL_BY_VALUE (courses-table-labels.ts) is built FROM
  // MODALITY_OPTIONS by construction, so that comparison could never fail: a
  // rename of "Asynchronous" in the module renames both sides of the
  // assertion identically. Comparing each hand-typed pair below against the
  // OPTIONS list and, separately, against the RESOLVER function is what
  // actually catches a rename or a values/resolver split.
  const FROZEN_MODALITY_PAIRS: readonly [string, string][] = [
    ["async", "Asynchronous"],
    ["sync", "Synchronous"],
  ];
  const FROZEN_EMAIL_CLIENT_PAIRS: readonly [string, string][] = [
    ["outlook", "Outlook"],
    ["gmail", "Gmail"],
    ["other", "Other"],
  ];

  it("MODALITY_OPTIONS matches the hand-written frozen value/label pairs exactly", () => {
    const nonEmpty = MODALITY_OPTIONS.filter((opt) => opt.value !== "");
    expect(nonEmpty.map((opt) => [opt.value, opt.label])).toEqual(FROZEN_MODALITY_PAIRS);
  });

  it("modalityLabel resolves each hand-written frozen pair to its literal label", () => {
    for (const [value, label] of FROZEN_MODALITY_PAIRS) {
      expect(modalityLabel(value), `modalityLabel("${value}") drifted from the frozen pairing`).toBe(label);
    }
  });

  it("EMAIL_CLIENT_OPTIONS matches the hand-written frozen value/label pairs exactly", () => {
    const nonEmpty = EMAIL_CLIENT_OPTIONS.filter((opt) => opt.value !== "");
    expect(nonEmpty.map((opt) => [opt.value, opt.label])).toEqual(FROZEN_EMAIL_CLIENT_PAIRS);
  });

  it("emailClientLabel resolves each hand-written frozen pair to its literal label", () => {
    for (const [value, label] of FROZEN_EMAIL_CLIENT_PAIRS) {
      expect(emailClientLabel(value), `emailClientLabel("${value}") drifted from the frozen pairing`).toBe(
        label
      );
    }
  });
});

describe("option lists lead with their empty 'Not set' entry", () => {
  it("MODALITY_OPTIONS[0] is the empty value labeled Not set", () => {
    expect(MODALITY_OPTIONS[0]).toEqual({ value: "", label: "Not set" });
  });

  it("EMAIL_CLIENT_OPTIONS[0] is the empty value labeled Not set", () => {
    expect(EMAIL_CLIENT_OPTIONS[0]).toEqual({ value: "", label: "Not set" });
  });
});
