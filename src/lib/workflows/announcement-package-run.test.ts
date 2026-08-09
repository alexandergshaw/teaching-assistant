// Tests for src/lib/workflows/announcement-package-run.ts - the package-path
// orchestration for docs/weekly-announcement-package-io-acceptance-criteria.md.
//
// Covers "Tests written BEFORE implementation" item 9 (start-date/week-count
// precedence across every combination of tile/package/explicit override) in
// full, plus this module's own core decision logic - the per-week
// resolution, format parsing, and the orchestrator's call sequence - since
// this is a brand-new module with no pre-existing coverage at all.
// Sabotage-checked per REGRESSION.md entry 239 check 10's rule ("a test that
// passes against broken code is worthless"): every assertion below was
// verified to FAIL when the behavior it pins was reverted, then restored -
// see the final report for the exact list.
import { describe, it, expect, vi } from "vitest";
import {
  resolvePackageStartDate,
  resolvePackageWeekCount,
  resolvePackageFormats,
  formatPostTimeLabel,
  resolveAnnouncementWeeks,
  toCartridgeWeeks,
  toPackagedAnnouncements,
  buildPackageWeekReportLines,
  buildPackageReportHeader,
  runAnnouncementPackage,
  deliverPackageArtifacts,
  runAndDeliverPackage,
  type PackageDraftCallbacks,
  type PackageBuildCallbacks,
} from "./announcement-package-run";
import type { AnnouncementSlot } from "@/lib/announcement-schedule";

// ── resolvePackageStartDate / resolvePackageWeekCount (AC1 item 10) ────────
//
// Precedence pinned here: explicit override > course tile > uploaded
// package. See announcement-package-run.ts's own header comment on
// resolvePackageStartDate for why "override" is read as taking precedence
// over both other sources, not merely filling a gap neither leaves.
describe("resolvePackageStartDate - AC1 item 10 precedence, every combination", () => {
  it("explicit override wins over both tile and package when all three are present", () => {
    const d = resolvePackageStartDate({
      tileStartDate: "2026-02-01",
      packageStartAt: "2026-03-01T00:00:00Z",
      explicitStartDate: "2026-01-05",
    });
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(0); // January
    expect(d?.getDate()).toBe(5);
  });

  it("tile wins over package when no explicit override is given", () => {
    const d = resolvePackageStartDate({
      tileStartDate: "2026-02-01",
      packageStartAt: "2026-03-01T00:00:00Z",
      explicitStartDate: "",
    });
    expect(d?.getMonth()).toBe(1); // February
    expect(d?.getDate()).toBe(1);
  });

  it("package is used only when neither tile nor explicit override is given", () => {
    const d = resolvePackageStartDate({
      tileStartDate: null,
      packageStartAt: "2026-03-01T12:00:00Z",
      explicitStartDate: "",
    });
    // Asserted via UTC getters, not local ones: packageStartAt is a real UTC
    // timestamp (unlike tileStartDate's local-midnight "YYYY-MM-DD"
    // convention above), and this suite must not depend on the machine's
    // own timezone - noon UTC keeps the same calendar date in every
    // real-world offset.
    expect(d?.getUTCMonth()).toBe(2); // March
    expect(d?.getUTCDate()).toBe(1);
  });

  it("null when none of the three sources yields a usable date", () => {
    expect(
      resolvePackageStartDate({ tileStartDate: null, packageStartAt: null, explicitStartDate: "" })
    ).toBeNull();
  });

  it("a malformed explicit override falls through to the tile, not to null", () => {
    const d = resolvePackageStartDate({
      tileStartDate: "2026-02-01",
      packageStartAt: null,
      explicitStartDate: "not-a-date",
    });
    expect(d?.getMonth()).toBe(1);
    expect(d?.getDate()).toBe(1);
  });

  it("a malformed package startAt is treated as absent", () => {
    expect(
      resolvePackageStartDate({ tileStartDate: null, packageStartAt: "not-a-date", explicitStartDate: "" })
    ).toBeNull();
  });
});

describe("resolvePackageWeekCount - AC1 item 10 precedence, every combination", () => {
  it("explicit override wins over both tile and package", () => {
    expect(resolvePackageWeekCount({ tileWeeks: 10, packageModuleCount: 5, explicitWeekCount: "12" })).toBe(12);
  });

  it("tile wins over package when no explicit override is given", () => {
    expect(resolvePackageWeekCount({ tileWeeks: 10, packageModuleCount: 5, explicitWeekCount: "" })).toBe(10);
  });

  it("package is used only when neither tile nor explicit override is given", () => {
    expect(resolvePackageWeekCount({ tileWeeks: null, packageModuleCount: 5, explicitWeekCount: "" })).toBe(5);
  });

  it("null when none of the three sources yields a positive count", () => {
    expect(resolvePackageWeekCount({ tileWeeks: null, packageModuleCount: null, explicitWeekCount: "" })).toBeNull();
  });

  it("a zero/negative source at any precedence level is treated as absent, not as a valid zero-week term", () => {
    expect(resolvePackageWeekCount({ tileWeeks: 0, packageModuleCount: 5, explicitWeekCount: "" })).toBe(5);
    expect(resolvePackageWeekCount({ tileWeeks: null, packageModuleCount: 5, explicitWeekCount: "0" })).toBe(5);
    expect(resolvePackageWeekCount({ tileWeeks: null, packageModuleCount: 5, explicitWeekCount: "-3" })).toBe(5);
  });
});

// ── resolvePackageFormats (AC3 item 16) ──────────────────────────────────
describe("resolvePackageFormats", () => {
  it("blank means both formats", () => {
    expect(resolvePackageFormats("")).toEqual({ imscc: true, zip: true });
  });

  it("selects only the named format(s)", () => {
    expect(resolvePackageFormats("imscc")).toEqual({ imscc: true, zip: false });
    expect(resolvePackageFormats("zip")).toEqual({ imscc: false, zip: true });
    expect(resolvePackageFormats("imscc\nzip")).toEqual({ imscc: true, zip: true });
  });
});

// ── formatPostTimeLabel (parsePostTime's own blank/malformed -> 08:00) ────
describe("formatPostTimeLabel", () => {
  it("blank degrades to 08:00", () => {
    expect(formatPostTimeLabel("")).toBe("08:00");
  });

  it("malformed input degrades to 08:00", () => {
    expect(formatPostTimeLabel("not-a-time")).toBe("08:00");
  });

  it("a valid time is zero-padded back out", () => {
    expect(formatPostTimeLabel("9:05")).toBe("09:05");
  });
});

// ── resolveAnnouncementWeeks - the core per-week decision ──────────────────
describe("resolveAnnouncementWeeks", () => {
  const slots: AnnouncementSlot[] = [
    { week: 1, postAt: new Date(2026, 0, 5, 8, 0, 0) },
    { week: 2, postAt: new Date(2026, 0, 12, 8, 0, 0) },
  ];

  it("template mode (drafts undefined): every week uses the rendered template, unconditionally", () => {
    const result = resolveAnnouncementWeeks(slots, "Week {week}", "Hello week {week}", undefined);
    expect(result).toEqual([
      { week: 1, postAt: slots[0].postAt, title: "Week 1", message: "Hello week 1", note: undefined },
      { week: 2, postAt: slots[1].postAt, title: "Week 2", message: "Hello week 2", note: undefined },
    ]);
  });

  it("module mode: a drafted week uses its own title/message; a week with no draft entry falls back to the template", () => {
    const result = resolveAnnouncementWeeks(slots, "", "Fallback {week}", [
      { week: 1, title: "Drafted Title", message: "Drafted message", note: "drafted from module X" },
    ]);
    expect(result[0]).toEqual({
      week: 1,
      postAt: slots[0].postAt,
      title: "Drafted Title",
      message: "Drafted message",
      note: "drafted from module X",
    });
    // Week 2 has no matching draft entry - falls back to the (blank) title
    // template -> "Week 2", and the message template -> "Fallback 2".
    expect(result[1].title).toBe("Week 2");
    expect(result[1].message).toBe("Fallback 2");
    expect(result[1].failed).toBeUndefined();
  });

  it("a deferred draft is reported failed, never silently downgraded to the template", () => {
    const result = resolveAnnouncementWeeks(slots, "Week {week}", "Fallback {week}", [
      { week: 1, defer: true, note: "not drafted this run - stopped for the drafting time budget" },
    ]);
    expect(result[0].failed).toBe("not drafted this run - stopped for the drafting time budget");
    expect(result[0].title).toBe("");
    expect(result[0].message).toBe("");
  });

  it("a blank drafted message with a blank template is failed, not posted/packaged blank", () => {
    const result = resolveAnnouncementWeeks(slots, "", "", [{ week: 1, message: "" }]);
    expect(result[0].failed).toMatch(/no drafted message and the message template is blank for week 1/);
  });
});

// ── toCartridgeWeeks / toPackagedAnnouncements ──────────────────────────────
describe("toCartridgeWeeks", () => {
  it("carries the resolved title/message/postAt into a single announcement per week, with no files/pages/assignments", () => {
    const weeks = toCartridgeWeeks(
      [{ week: 1, postAt: new Date(Date.UTC(2026, 0, 5, 13, 0, 0)), title: "Week 1", message: "Body" }],
      true
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0].files).toEqual([]);
    expect(weeks[0].pages).toEqual([]);
    expect(weeks[0].assignments).toEqual([]);
    expect(weeks[0].announcements).toHaveLength(1);
    expect(weeks[0].announcements![0].title).toBe("Week 1");
    expect(weeks[0].announcements![0].emailCopy).toBe(true);
    // Zoneless UTC form: no trailing "Z" or milliseconds.
    expect(weeks[0].announcements![0].postAtUtc).toBe("2026-01-05T13:00:00");
  });
});

describe("toPackagedAnnouncements", () => {
  it("uses a full ISO-8601 timestamp (with Z), unlike the cartridge builder's zoneless form", () => {
    const items = toPackagedAnnouncements([
      { week: 1, postAt: new Date(Date.UTC(2026, 0, 5, 13, 0, 0)), title: "Week 1", message: "Body" },
    ]);
    expect(items[0].postAtIso).toBe("2026-01-05T13:00:00.000Z");
  });
});

// ── Report assembly ─────────────────────────────────────────────────────
describe("buildPackageWeekReportLines", () => {
  it("a successful week names its postAt and title; a failed week explains why, never claims content", () => {
    const lines = buildPackageWeekReportLines([
      { week: 1, postAt: new Date(2026, 0, 5), title: "Week 1", message: "Body", note: "drafted from module X" },
      { week: 2, postAt: new Date(2026, 0, 12), title: "", message: "", failed: "no module content for week 2" },
    ]);
    expect(lines[0]).toContain("Week 1: packaged for");
    expect(lines[0]).toContain('"Week 1"');
    expect(lines[0]).toContain("drafted from module X");
    expect(lines[1]).toBe("Week 2: not packaged - no module content for week 2.");
  });
});

describe("buildPackageReportHeader", () => {
  it("names the source, the delivery, the built formats, and the email-copy note, in that order", () => {
    const lines = buildPackageReportHeader({
      sourceLabel: "Canvas module content",
      deliveryLabel: "package only (no LMS changes)",
      formats: { imscc: true, zip: true },
      emailCopyNote: "Recorded: students will be emailed a copy of each announcement.",
    });
    expect(lines[0]).toBe("Source: Canvas module content.");
    expect(lines[1]).toBe("Delivery: package only (no LMS changes).");
    expect(lines[2]).toBe(
      "Formats built: course import package (.imscc) and plain zip of the announcement documents."
    );
    expect(lines[3]).toBe("Recorded: students will be emailed a copy of each announcement.");
  });

  it("inserts the override note, when given, between delivery and formats", () => {
    const lines = buildPackageReportHeader({
      sourceLabel: "an uploaded course cartridge or export",
      deliveryLabel: "package only (forced by the uploaded-package source)",
      overrideNote: "Source is an uploaded package, so nothing was written to the LMS - the package below is the whole output.",
      formats: { imscc: true, zip: false },
      emailCopyNote: "note",
    });
    expect(lines[2]).toBe(
      "Source is an uploaded package, so nothing was written to the LMS - the package below is the whole output."
    );
    expect(lines[3]).toBe("Formats built: course import package (.imscc).");
  });

  it("reports 'none' when neither format was built", () => {
    const lines = buildPackageReportHeader({
      sourceLabel: "x",
      deliveryLabel: "y",
      formats: { imscc: false, zip: false },
      emailCopyNote: "note",
    });
    expect(lines).toContain("Formats built: none.");
  });
});

// ── The orchestrator ─────────────────────────────────────────────────────
describe("runAnnouncementPackage", () => {
  function fakeBuildCallbacks(): PackageBuildCallbacks {
    return {
      buildImscc: vi.fn().mockResolvedValue(new Blob(["imscc"])),
      buildZip: vi.fn().mockResolvedValue(new Blob(["zip"])),
    };
  }

  it("module mode drafts exactly once for every in-session week, then builds both formats by default", async () => {
    const draft = vi.fn().mockResolvedValue({
      drafts: [
        { week: 1, title: "T1", message: "M1" },
        { week: 2, title: "T2", message: "M2" },
      ],
    });
    const build = fakeBuildCallbacks();

    const result = await runAnnouncementPackage(
      {
        mode: "module",
        startDate: new Date(2026, 0, 5),
        weekCount: 2,
        weekday: 1,
        postTimeRaw: "",
        titleTemplate: "",
        messageTemplate: "",
        courseName: "Course",
        emailCopyNote: "note",
        emailCopyValue: null,
        weekdayLabel: "Monday",
        formats: { imscc: true, zip: true },
      },
      { draft },
      build
    );

    expect(draft).toHaveBeenCalledTimes(1);
    expect(draft).toHaveBeenCalledWith([1, 2], 2);
    expect(build.buildImscc).toHaveBeenCalledTimes(1);
    expect(build.buildZip).toHaveBeenCalledTimes(1);
    expect(result.resolvedWeeks).toHaveLength(2);
    expect(result.imsccBlob).not.toBeNull();
    expect(result.zipBlob).not.toBeNull();
  });

  it("template mode never calls the draft callback at all", async () => {
    const draft = vi.fn();
    const build = fakeBuildCallbacks();

    await runAnnouncementPackage(
      {
        mode: "template",
        startDate: new Date(2026, 0, 5),
        weekCount: 1,
        weekday: 1,
        postTimeRaw: "",
        titleTemplate: "Week {week}",
        messageTemplate: "Hello {week}",
        courseName: "Course",
        emailCopyNote: "note",
        emailCopyValue: null,
        weekdayLabel: "Monday",
        formats: { imscc: true, zip: true },
      },
      { draft },
      build
    );

    expect(draft).not.toHaveBeenCalled();
  });

  it("when inputs.drafts is supplied (even an empty array), drafting is skipped entirely - the 'both' delivery reuse case (AC6 item 39)", async () => {
    const draft = vi.fn();
    const build = fakeBuildCallbacks();

    await runAnnouncementPackage(
      {
        mode: "module",
        startDate: new Date(2026, 0, 5),
        weekCount: 1,
        weekday: 1,
        postTimeRaw: "",
        titleTemplate: "Week {week}",
        messageTemplate: "Fallback {week}",
        courseName: "Course",
        emailCopyNote: "note",
        emailCopyValue: null,
        weekdayLabel: "Monday",
        formats: { imscc: true, zip: true },
        drafts: [],
      },
      { draft },
      build
    );

    expect(draft).not.toHaveBeenCalled();
  });

  it("only builds the requested format(s)", async () => {
    const draft = vi.fn().mockResolvedValue({ drafts: [{ week: 1, title: "T", message: "M" }] });
    const build = fakeBuildCallbacks();

    await runAnnouncementPackage(
      {
        mode: "module",
        startDate: new Date(2026, 0, 5),
        weekCount: 1,
        weekday: 1,
        postTimeRaw: "",
        titleTemplate: "",
        messageTemplate: "",
        courseName: "Course",
        emailCopyNote: "note",
        emailCopyValue: null,
        weekdayLabel: "Monday",
        formats: { imscc: true, zip: false },
      },
      { draft },
      build
    );

    expect(build.buildImscc).toHaveBeenCalledTimes(1);
    expect(build.buildZip).not.toHaveBeenCalled();
  });

  it("throws when nothing could be resolved for any in-session week - never a silent empty package", async () => {
    const draft = vi.fn().mockResolvedValue({ drafts: [] });
    const build = fakeBuildCallbacks();

    await expect(
      runAnnouncementPackage(
        {
          mode: "module",
          startDate: new Date(2026, 0, 5),
          weekCount: 1,
          weekday: 1,
          postTimeRaw: "",
          titleTemplate: "",
          messageTemplate: "",
          courseName: "Course",
          emailCopyNote: "note",
          emailCopyValue: null,
          weekdayLabel: "Monday",
          formats: { imscc: true, zip: true },
        },
        { draft },
        build
      )
    ).rejects.toThrow("Nothing was drafted for any in-session week - there is nothing to package.");
    expect(build.buildImscc).not.toHaveBeenCalled();
  });

  it("a drafting failure (`{ error }`) never blocks packaging - falls back to the template", async () => {
    const draft: PackageDraftCallbacks["draft"] = vi.fn().mockResolvedValue({ error: "quota exceeded" });
    const build = fakeBuildCallbacks();

    const result = await runAnnouncementPackage(
      {
        mode: "module",
        startDate: new Date(2026, 0, 5),
        weekCount: 1,
        weekday: 1,
        postTimeRaw: "",
        titleTemplate: "Week {week}",
        messageTemplate: "Fallback {week}",
        courseName: "Course",
        emailCopyNote: "note",
        emailCopyValue: null,
        weekdayLabel: "Monday",
        formats: { imscc: true, zip: true },
      },
      { draft },
      build
    );

    expect(result.resolvedWeeks[0].failed).toBeUndefined();
    expect(result.resolvedWeeks[0].message).toBe("Fallback 1");
  });
});

// ── Delivery ─────────────────────────────────────────────────────────────
describe("deliverPackageArtifacts", () => {
  it("saves both blobs via saveBundle and saveCourseExportFile when a tile is bound", async () => {
    const saveBundle = vi.fn().mockResolvedValue(undefined);
    const saveCourseExportFile = vi.fn().mockResolvedValue(undefined);

    const outcome = await deliverPackageArtifacts(new Blob(["imscc"]), new Blob(["zip"]), "My Course", "course-1", {
      saveBundle,
      saveCourseExportFile,
    });

    expect(saveBundle).toHaveBeenCalledTimes(2);
    expect(saveCourseExportFile).toHaveBeenCalledTimes(2);
    expect(saveCourseExportFile).toHaveBeenCalledWith("course-1", expect.any(Blob), "My Course-weekly-announcements.imscc");
    expect(outcome.reportLines).toEqual([
      "Course import package saved: My Course-weekly-announcements.imscc.",
      "Plain zip of the announcement documents saved: My Course-weekly-announcements.zip.",
    ]);
  });

  it("never calls saveCourseExportFile without a tile id", async () => {
    const saveBundle = vi.fn().mockResolvedValue(undefined);
    const saveCourseExportFile = vi.fn().mockResolvedValue(undefined);

    await deliverPackageArtifacts(new Blob(["imscc"]), null, "My Course", null, { saveBundle, saveCourseExportFile });

    expect(saveBundle).toHaveBeenCalledTimes(1);
    expect(saveCourseExportFile).not.toHaveBeenCalled();
  });

  // AC3 item 22: DOWNLOADABLE_OUTPUT_KEY is set only on an attended run
  // (`typeof document !== "undefined"`). vitest runs `environment: "node"`
  // (vitest.config's own setting - see REGRESSION.md's "vitest is node-env"
  // note repeated across this codebase's test files), so `document` is
  // always undefined here - this test can therefore only confirm the
  // NODE-ENV half of that gate (no DOWNLOADABLE_OUTPUT_KEY ever appears in
  // these runs); the browser half (that it DOES appear when `document`
  // exists, and that the .imscc wins when both formats are built) is NOT
  // mechanically verifiable under this suite and is pinned by reading
  // announcement-package-run.ts's own source instead.
  it("never sets DOWNLOADABLE_OUTPUT_KEY under vitest's node environment", async () => {
    const saveBundle = vi.fn().mockResolvedValue(undefined);
    const outcome = await deliverPackageArtifacts(new Blob(["imscc"]), new Blob(["zip"]), "Course", null, {
      saveBundle,
      saveCourseExportFile: null,
    });
    expect(outcome.outputs).toEqual({});
  });
});

describe("runAndDeliverPackage", () => {
  it("ties resolution, header, and delivery together and counts only the successfully-packaged weeks", async () => {
    const draft = vi.fn().mockResolvedValue({
      drafts: [{ week: 1, title: "T1", message: "M1" }],
    });
    const saveBundle = vi.fn().mockResolvedValue(undefined);

    const result = await runAndDeliverPackage({
      inputs: {
        mode: "module",
        startDate: new Date(2026, 0, 5),
        weekCount: 1,
        weekday: 1,
        postTimeRaw: "",
        titleTemplate: "",
        messageTemplate: "",
        courseName: "Course",
        emailCopyNote: "Recorded note.",
        emailCopyValue: null,
        weekdayLabel: "Monday",
        formats: { imscc: false, zip: true },
      },
      draftCallbacks: { draft },
      buildCallbacks: { buildZip: vi.fn().mockResolvedValue(new Blob(["zip"])) },
      save: { saveBundle, saveCourseExportFile: null },
      baseFileName: "Course",
      tileId: null,
      sourceLabel: "Canvas module content",
      deliveryLabel: "package only (no LMS changes)",
    });

    expect(result.packagedCount).toBe(1);
    expect(result.reportLines[0]).toBe("Source: Canvas module content.");
    expect(result.reportLines).toContain("Plain zip of the announcement documents saved: Course-weekly-announcements.zip.");
    expect(result.reportLines.some((l) => l.startsWith("Week 1: packaged for"))).toBe(true);
  });
});
