// TDD - written from the AC before implementation (avatar-likeness work item).
// These pin the Files-tab consequences of widening recording_files.kind with
// "sample" (avatar training footage) and "avatar" (generated AI video).
//
// Why this file exists: the 2026-08-06 area baseline in docs/REGRESSION.md
// proved that a kind the UI does not know about is SILENTLY invisible under
// every filter except "All" - it does not throw, it just vanishes. That is the
// exact failure these tests exist to catch.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { filterAndSortFiles, FILES_FILTER_KIND_OPTIONS, type FilesFilterKind } from "./filter-sort";
import { getDisplayKind, canPlayInline } from "./helpers";
import type { RecordingFile } from "@/lib/recording-files";

const mk = (over: Partial<RecordingFile>): RecordingFile => ({
  id: "id-1",
  name: "thing",
  kind: "recording",
  mimeType: "video/webm",
  sizeBytes: 100,
  durationSec: 10,
  storagePath: "user/id-1.webm",
  source: null,
  origin: null,
  workflowName: null,
  workflowId: null,
  workflowRunId: null,
  createdAt: "2026-08-06T00:00:00Z",
  ...over,
});

const shown = (files: RecordingFile[], filterKind: FilesFilterKind) =>
  filterAndSortFiles(files, { search: "", filterWorkflow: "all", filterKind, sortBy: "newest" });

// The filter kinds must come from ONE exported list, because today the set is
// written out by hand in two places that can drift silently: the FilesFilterKind
// union in filter-sort.ts and BOTH an inline union and a hand-written MenuItem
// list in FilterToolbar.tsx:97-107. Deriving the type and the dropdown from this
// array is what makes "the filter exists in the UI" testable at all in a node
// environment - there is no jsdom in this project's vitest config.
describe("the filter-kind option list is the single source of truth", () => {
  const values = () => FILES_FILTER_KIND_OPTIONS.map((o) => o.value);

  it("still offers every pre-existing filter", () => {
    // Set comparison, not order: regrouping the dropdown is a design decision
    // this feature has no business freezing.
    for (const v of ["all", "recording", "captioned", "narrated", "audio", "bundle", "file"]) {
      expect(values(), `${v} must survive`).toContain(v);
    }
  });

  it("offers a filter for avatar training samples", () => {
    expect(values()).toContain("sample");
  });

  it("offers a filter for generated avatar videos", () => {
    expect(values()).toContain("avatar");
  });

  it("gives every filter a human label, never a raw enum value", () => {
    for (const o of FILES_FILTER_KIND_OPTIONS) {
      expect(o.label.trim().length).toBeGreaterThan(0);
      expect(o.label).not.toBe(o.value);
    }
  });

  it("has no duplicate values", () => {
    expect(new Set(values()).size).toBe(values().length);
  });

  it("is what the dropdown actually renders from", () => {
    // Without this, an implementer can export a perfect options array and ship
    // a FilterToolbar that still hardcodes its own MenuItem list - every test
    // green, and "Sample"/"Avatar" never appear in the UI. Same source-scan
    // technique the repo already uses in recording-split.structure.test.ts.
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/components/files/FilterToolbar.tsx"),
      "utf-8"
    );
    expect(src).toContain("FILES_FILTER_KIND_OPTIONS");
    // The hand-written per-kind MenuItems must be gone, not merely supplemented.
    for (const v of ["recording", "captioned", "narrated", "bundle"]) {
      expect(src, `MenuItem value="${v}" should be derived, not literal`).not.toContain(
        `<MenuItem value="${v}">`
      );
    }
  });
});

describe("Files filter with the avatar-likeness kinds", () => {
  const sample = mk({ id: "s", name: "My sample", kind: "sample", mimeType: "video/mp4" });
  const avatar = mk({ id: "a", name: "My avatar video", kind: "avatar", mimeType: "video/mp4" });
  const plain = mk({ id: "r", name: "A recording", kind: "recording" });
  const all = [sample, avatar, plain];

  it("surfaces training samples under their own filter", () => {
    expect(shown(all, "sample").map((f) => f.id)).toEqual(["s"]);
  });

  it("surfaces generated avatar videos under their own filter", () => {
    expect(shown(all, "avatar").map((f) => f.id)).toEqual(["a"]);
  });

  it("keeps both visible under All", () => {
    expect(shown(all, "all").map((f) => f.id).sort()).toEqual(["a", "r", "s"]);
  });

  it("does not let a sample or an avatar leak into the Recordings filter", () => {
    expect(shown(all, "recording").map((f) => f.id)).toEqual(["r"]);
  });

  it("does not let a sample or an avatar leak into unrelated filters", () => {
    for (const k of ["captioned", "narrated", "bundle", "file", "audio"] as FilesFilterKind[]) {
      expect(shown([sample, avatar], k)).toEqual([]);
    }
  });

  it("still honours the search box for the new kinds", () => {
    const out = filterAndSortFiles(all, {
      search: "avatar",
      filterWorkflow: "all",
      filterKind: "all",
      sortBy: "newest",
    });
    expect(out.map((f) => f.id)).toEqual(["a"]);
  });

  it("still honours the workflow filter for the new kinds", () => {
    const fromWorkflow = mk({ id: "w", kind: "avatar", mimeType: "video/mp4", source: "workflow" });
    expect(
      filterAndSortFiles([avatar, fromWorkflow], {
        search: "",
        filterWorkflow: "workflow",
        filterKind: "avatar",
        sortBy: "newest",
      }).map((f) => f.id)
    ).toEqual(["w"]);
  });
});

describe("badges for the avatar-likeness kinds", () => {
  // The 2026-08-06 area baseline OBSERVED getDisplayKind returning
  // {label: "sample"} and {label: "avatar"} - the raw lowercase enum leaking
  // into the UI next to properly-cased siblings, because kindLabels only knows
  // recording/captioned/narrated.
  it("gives a training sample a properly-cased label", () => {
    expect(getDisplayKind(mk({ kind: "sample", mimeType: "video/mp4" })).label).toBe("Sample");
  });

  it("gives a generated avatar video a properly-cased label", () => {
    expect(getDisplayKind(mk({ kind: "avatar", mimeType: "video/mp4" })).label).toBe("Avatar");
  });

  it("leaves the existing labels alone", () => {
    expect(getDisplayKind(mk({ kind: "recording" })).label).toBe("Recording");
    expect(getDisplayKind(mk({ kind: "captioned" })).label).toBe("Captioned");
    expect(getDisplayKind(mk({ kind: "narrated" })).label).toBe("Narrated");
  });

  it("keeps the Play button reachable for both new kinds", () => {
    // canPlayInline must be the REAL gate, extracted from FileRow.tsx:121 and
    // called by it. Re-implementing the boolean inside this test would make the
    // assertion a tautology that passes even if FileRow were deleted.
    for (const kind of ["sample", "avatar"] as const) {
      expect(canPlayInline(mk({ kind, mimeType: "video/mp4" })), `${kind} should be playable`).toBe(true);
    }
  });

  it("still gates playback the way it always did", () => {
    expect(canPlayInline(mk({ kind: "recording", mimeType: "video/webm" }))).toBe(true);
    expect(canPlayInline(mk({ kind: "recording", mimeType: "audio/webm" }))).toBe(true);
    expect(canPlayInline(mk({ kind: "bundle", mimeType: "application/zip" }))).toBe(false);
    expect(canPlayInline(mk({ kind: "file", mimeType: "application/pdf" }))).toBe(false);
  });

  it("is wired into FileRow rather than duplicated there", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/components/files/FileRow.tsx"),
      "utf-8"
    );
    expect(src).toContain("canPlayInline");
    // An import alone is not wiring: the Play button's decision point must
    // actually CALL the function, or the import is dead weight while the
    // button keeps rendering off its own hand-rolled boolean.
    expect(src, "canPlayInline must be invoked at the Play button, not merely imported").toContain(
      "canPlayInline("
    );
    // And the hand-rolled gate canPlayInline replaced must not have come
    // back alongside the import. This is the exact expression FileRow used
    // before extraction (see docs/REGRESSION.md, 2026-08-06 "recording_files.kind
    // as a five-place contract", check 14) - a negative assertion so a
    // duplicate can't sit next to the import and pass unnoticed.
    expect(
      src,
      "the pre-extraction inline Play gate must not survive next to the canPlayInline import"
    ).not.toContain('["recording", "captioned", "narrated"].includes(file.kind)');
  });
});
