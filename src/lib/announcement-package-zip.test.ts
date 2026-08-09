// Tests for src/lib/announcement-package-zip.ts (the "plain zip of the
// announcement documents" OUT format,
// docs/weekly-announcement-package-io-acceptance-criteria.md AC3 item 21).
//
// buildAnnouncementZipEntries is pure and synchronous, so the frozen-literal
// assertions below are HAND-WRITTEN expected strings, not values computed
// from the implementation - the whole point of pinning them is to catch a
// future edit to the builder that silently changes the file format. Only
// buildAnnouncementZip (the thin JSZip wrapper) needs an actual archive.
//
// AnnouncementZipOptions carries TWO email-copy fields, deliberately kept
// distinct in these tests: `emailCopy` (boolean | null) is the MACHINE-
// READABLE resolved choice, written into front matter as a bare scalar;
// `emailCopyNote` is the HUMAN-readable prose, rendered verbatim in the
// README only. A test that only ever paired them 1:1 could not catch either
// field silently leaking into the other's spot, so several tests below
// deliberately combine an `emailCopy` value with an unrelated-looking note.

import { describe, it, expect } from "vitest";
import {
  buildAnnouncementZipEntries,
  buildAnnouncementZip,
  type PackagedAnnouncement,
  type AnnouncementZipOptions,
} from "./announcement-package-zip";

const BASE_OPTIONS: AnnouncementZipOptions = {
  courseName: "Intro to Astronomy",
  weekdayLabel: "Monday",
  postTimeLabel: "09:30",
  emailCopy: null,
  emailCopyNote:
    "Canvas has no per-announcement email setting - students are notified by their own Canvas notification preferences when each week posts.",
};

// Deliberately OUT OF ORDER (week 2 before week 1) so every test built on
// this fixture also exercises the sort-before-render rule.
const TWO_WEEK_FIXTURE: PackagedAnnouncement[] = [
  {
    week: 2,
    title: "Week 2: Orbits and Gravity",
    message: "This week we cover orbital mechanics.\n\nRead chapter 4 before Wednesday.",
    postAtIso: "2026-09-14T13:30:00.000Z",
  },
  {
    week: 1,
    title: "Week 1: Welcome to the Cosmos",
    message: "Welcome to the course! Let's get started.",
    postAtIso: "2026-09-07T13:30:00.000Z",
  },
];

// Hand-written expected content - do not derive this from the builder.
// postAt is a JSON-quoted string and emailCopy is the bare `null` scalar -
// every front-matter field goes through the same JSON.stringify hardening
// (defects 5 and 6).
const EXPECTED_WEEK_01_CONTENT =
  "---\n" +
  "week: 1\n" +
  'postAt: "2026-09-07T13:30:00.000Z"\n' +
  "emailCopy: null\n" +
  "---\n" +
  "\n" +
  "# Week 1: Welcome to the Cosmos\n" +
  "\n" +
  "Welcome to the course! Let's get started.\n";

const EXPECTED_WEEK_02_CONTENT =
  "---\n" +
  "week: 2\n" +
  'postAt: "2026-09-14T13:30:00.000Z"\n' +
  "emailCopy: null\n" +
  "---\n" +
  "\n" +
  "# Week 2: Orbits and Gravity\n" +
  "\n" +
  "This week we cover orbital mechanics.\n\nRead chapter 4 before Wednesday.\n";

// Hand-written expected README - do not derive this from the builder. The
// README keeps rendering emailCopyNote (the human note), never the bare
// emailCopy scalar.
const EXPECTED_README =
  "# Intro to Astronomy - Weekly Announcements\n" +
  "\n" +
  "Weekday: Monday\n" +
  "Post time: 09:30\n" +
  "Email copy: Canvas has no per-announcement email setting - students are notified by their own Canvas notification preferences when each week posts.\n" +
  "\n" +
  "## Weeks\n" +
  "\n" +
  "- Week 1: 2026-09-07T13:30:00.000Z - Week 1: Welcome to the Cosmos\n" +
  "- Week 2: 2026-09-14T13:30:00.000Z - Week 2: Orbits and Gravity\n";

describe("buildAnnouncementZipEntries - frozen-literal content", () => {
  it("renders week 1's file content character for character", () => {
    const entries = buildAnnouncementZipEntries(TWO_WEEK_FIXTURE, BASE_OPTIONS);
    const week1 = entries.find((e) => e.path === "week-01-announcement.md");
    expect(week1?.content).toBe(EXPECTED_WEEK_01_CONTENT);
  });

  it("renders week 2's file content character for character", () => {
    const entries = buildAnnouncementZipEntries(TWO_WEEK_FIXTURE, BASE_OPTIONS);
    const week2 = entries.find((e) => e.path === "week-02-announcement.md");
    expect(week2?.content).toBe(EXPECTED_WEEK_02_CONTENT);
  });

  it("renders README.md character for character", () => {
    const entries = buildAnnouncementZipEntries(TWO_WEEK_FIXTURE, BASE_OPTIONS);
    const readme = entries.find((e) => e.path === "README.md");
    expect(readme?.content).toBe(EXPECTED_README);
  });

  it("returns exactly three entries for the two-week fixture (two weeks + README)", () => {
    const entries = buildAnnouncementZipEntries(TWO_WEEK_FIXTURE, BASE_OPTIONS);
    expect(entries.map((e) => e.path)).toEqual([
      "week-01-announcement.md",
      "week-02-announcement.md",
      "README.md",
    ]);
  });
});

describe("buildAnnouncementZipEntries - zero-padding", () => {
  it.each([
    [0, "week-00-announcement.md"],
    [1, "week-01-announcement.md"],
    [7, "week-07-announcement.md"],
    [12, "week-12-announcement.md"],
    [100, "week-100-announcement.md"],
    [1000, "week-1000-announcement.md"],
  ])("week %i renders as %s (padded to at least 2 digits, never truncated)", (week, expectedPath) => {
    const items: PackagedAnnouncement[] = [
      { week, title: "Some Title", message: "Some message.", postAtIso: "2026-09-07T13:30:00.000Z" },
    ];
    const entries = buildAnnouncementZipEntries(items, BASE_OPTIONS);
    expect(entries[0].path).toBe(expectedPath);
  });
});

describe("buildAnnouncementZipEntries - sorting", () => {
  it("sorts entries and README lines ascending by week regardless of input order", () => {
    const outOfOrder: PackagedAnnouncement[] = [
      { week: 3, title: "Week 3", message: "msg3", postAtIso: "2026-09-21T13:30:00.000Z" },
      { week: 1, title: "Week 1", message: "msg1", postAtIso: "2026-09-07T13:30:00.000Z" },
      { week: 2, title: "Week 2", message: "msg2", postAtIso: "2026-09-14T13:30:00.000Z" },
    ];

    const entries = buildAnnouncementZipEntries(outOfOrder, BASE_OPTIONS);

    expect(entries.map((e) => e.path)).toEqual([
      "week-01-announcement.md",
      "week-02-announcement.md",
      "week-03-announcement.md",
      "README.md",
    ]);

    const readme = entries.find((e) => e.path === "README.md");
    const weekLines = (readme?.content ?? "").split("\n").filter((l) => l.startsWith("- Week"));
    expect(weekLines).toEqual([
      "- Week 1: 2026-09-07T13:30:00.000Z - Week 1",
      "- Week 2: 2026-09-14T13:30:00.000Z - Week 2",
      "- Week 3: 2026-09-21T13:30:00.000Z - Week 3",
    ]);
  });
});

describe("buildAnnouncementZipEntries - error cases", () => {
  it("throws the exact message for an empty items array", () => {
    expect(() => buildAnnouncementZipEntries([], BASE_OPTIONS)).toThrow(
      "There are no announcements to package."
    );
  });

  it("throws the exact message for a duplicate week number", () => {
    const items: PackagedAnnouncement[] = [
      { week: 5, title: "First", message: "a", postAtIso: "2026-09-07T13:30:00.000Z" },
      { week: 5, title: "Second", message: "b", postAtIso: "2026-09-14T13:30:00.000Z" },
    ];
    expect(() => buildAnnouncementZipEntries(items, BASE_OPTIONS)).toThrow(
      "Two announcements were built for week 5."
    );
  });
});

describe("buildAnnouncementZipEntries - title and body guards", () => {
  it("collapses a title with embedded newlines and tabs into a single line", () => {
    const items: PackagedAnnouncement[] = [
      {
        week: 1,
        title: "Week\n1:\tWelcome   to\nthe\tCourse",
        message: "Body text.",
        postAtIso: "2026-09-07T13:30:00.000Z",
      },
    ];
    const entries = buildAnnouncementZipEntries(items, BASE_OPTIONS);
    const content = entries[0].content;
    expect(content).toContain("\n# Week 1: Welcome to the Course\n");
    // No raw newline or tab survives inside the heading line itself.
    const headingLine = content.split("\n\n")[1];
    expect(headingLine).toBe("# Week 1: Welcome to the Course");
  });

  it("renders a whitespace-only title as an empty heading line, without crashing", () => {
    const items: PackagedAnnouncement[] = [
      {
        week: 1,
        title: "   \n\t  ",
        message: "Body.",
        postAtIso: "2026-09-07T13:30:00.000Z",
      },
    ];
    const entries = buildAnnouncementZipEntries(items, BASE_OPTIONS);
    const expected =
      "---\n" +
      "week: 1\n" +
      'postAt: "2026-09-07T13:30:00.000Z"\n' +
      "emailCopy: null\n" +
      "---\n" +
      "\n" +
      "# \n" +
      "\n" +
      "Body.\n";
    expect(entries[0].content).toBe(expected);
  });

  it("carries a title containing a quote and a backslash through untouched (the heading is not JSON-escaped)", () => {
    const items: PackagedAnnouncement[] = [
      {
        week: 1,
        title: 'Week 1: "Orbits" \\ Gravity',
        message: "Body.",
        postAtIso: "2026-09-07T13:30:00.000Z",
      },
    ];
    const entries = buildAnnouncementZipEntries(items, BASE_OPTIONS);
    const expected =
      "---\n" +
      "week: 1\n" +
      'postAt: "2026-09-07T13:30:00.000Z"\n' +
      "emailCopy: null\n" +
      "---\n" +
      "\n" +
      '# Week 1: "Orbits" \\ Gravity\n' +
      "\n" +
      "Body.\n";
    expect(entries[0].content).toBe(expected);
  });

  it("preserves a message containing CRLF (\\r\\n) line endings exactly", () => {
    const items: PackagedAnnouncement[] = [
      {
        week: 1,
        title: "Week 1",
        message: "Line one.\r\nLine two follows a CRLF.",
        postAtIso: "2026-09-07T13:30:00.000Z",
      },
    ];
    const entries = buildAnnouncementZipEntries(items, BASE_OPTIONS);
    const expected =
      "---\n" +
      "week: 1\n" +
      'postAt: "2026-09-07T13:30:00.000Z"\n' +
      "emailCopy: null\n" +
      "---\n" +
      "\n" +
      "# Week 1\n" +
      "\n" +
      "Line one.\r\nLine two follows a CRLF.\n";
    expect(entries[0].content).toBe(expected);
  });

  it("does not let a message beginning with '---' corrupt the front matter", () => {
    const items: PackagedAnnouncement[] = [
      {
        week: 1,
        title: "Week 1",
        message: "---\nThis message starts with a delimiter-looking line.",
        postAtIso: "2026-09-07T13:30:00.000Z",
      },
    ];
    const entries = buildAnnouncementZipEntries(items, BASE_OPTIONS);
    const content = entries[0].content;

    // Front matter is the block between the FIRST two '---' lines - that is
    // where week/postAt/emailCopy must live, unaffected by anything later.
    const dashLineIndexes: number[] = [];
    content.split("\n").forEach((line, idx) => {
      if (line === "---") dashLineIndexes.push(idx);
    });
    expect(dashLineIndexes.length).toBeGreaterThanOrEqual(2);
    const lines = content.split("\n");
    const frontMatterLines = lines.slice(dashLineIndexes[0] + 1, dashLineIndexes[1]);
    expect(frontMatterLines).toEqual([
      "week: 1",
      'postAt: "2026-09-07T13:30:00.000Z"',
      "emailCopy: null",
    ]);

    // The heading still appears intact, and the body's own '---' line rides
    // along after it, unmolested.
    expect(content).toContain("\n\n# Week 1\n\n---\nThis message starts with a delimiter-looking line.\n");
  });
});

describe("buildAnnouncementZipEntries - front matter cannot be broken by a hostile field (defect 6)", () => {
  it("keeps exactly three keys between the first two '---' lines when postAtIso itself contains a newline and a '---'-looking line", () => {
    // Proven attack: an UNESCAPED postAtIso like this closes the front-
    // matter block three lines early, drops emailCopy out of it entirely,
    // and injects an "owned: true" line. Every front-matter field now goes
    // through the same JSON.stringify hardening (frontMatterScalar), so the
    // whole hostile value is folded onto ONE escaped, quoted line instead.
    const hostilePostAt = "2026-01-05\n---\nowned: true";
    const items: PackagedAnnouncement[] = [
      { week: 1, title: "Week 1", message: "Body.", postAtIso: hostilePostAt },
    ];
    const options: AnnouncementZipOptions = {
      courseName: "Intro to Astronomy",
      weekdayLabel: "Monday",
      postTimeLabel: "09:30",
      emailCopy: true,
      emailCopyNote: "Recorded: students will be emailed a copy of each announcement.",
    };

    const entries = buildAnnouncementZipEntries(items, options);
    const content = entries[0].content;
    const lines = content.split("\n");
    const dashLineIndexes: number[] = [];
    lines.forEach((line, idx) => {
      if (line === "---") dashLineIndexes.push(idx);
    });
    expect(dashLineIndexes.length).toBeGreaterThanOrEqual(2);

    const frontMatterLines = lines.slice(dashLineIndexes[0] + 1, dashLineIndexes[1]);
    expect(frontMatterLines).toEqual([
      "week: 1",
      'postAt: "2026-01-05\\n---\\nowned: true"',
      "emailCopy: true",
    ]);
  });
});

describe("buildAnnouncementZipEntries - emailCopy renders as a bare scalar (defect 5)", () => {
  it("emailCopy: true renders as an unquoted true, not a prose string", () => {
    const items: PackagedAnnouncement[] = [
      { week: 1, title: "Week 1", message: "Body text.", postAtIso: "2026-09-07T13:30:00.000Z" },
    ];
    const options: AnnouncementZipOptions = {
      courseName: "Intro to Astronomy",
      weekdayLabel: "Monday",
      postTimeLabel: "09:30",
      emailCopy: true,
      emailCopyNote: "Recorded: students will be emailed a copy of each announcement.",
    };
    const entries = buildAnnouncementZipEntries(items, options);
    const week1 = entries.find((e) => e.path === "week-01-announcement.md");
    const expected =
      "---\n" +
      "week: 1\n" +
      'postAt: "2026-09-07T13:30:00.000Z"\n' +
      "emailCopy: true\n" +
      "---\n" +
      "\n" +
      "# Week 1\n" +
      "\n" +
      "Body text.\n";
    expect(week1?.content).toBe(expected);
  });

  it("emailCopy: false renders as an unquoted false, not a prose string", () => {
    const items: PackagedAnnouncement[] = [
      { week: 1, title: "Week 1", message: "Body text.", postAtIso: "2026-09-07T13:30:00.000Z" },
    ];
    const options: AnnouncementZipOptions = {
      courseName: "Intro to Astronomy",
      weekdayLabel: "Monday",
      postTimeLabel: "09:30",
      emailCopy: false,
      emailCopyNote: "Recorded: students will not be emailed a copy of each announcement.",
    };
    const entries = buildAnnouncementZipEntries(items, options);
    const week1 = entries.find((e) => e.path === "week-01-announcement.md");
    const expected =
      "---\n" +
      "week: 1\n" +
      'postAt: "2026-09-07T13:30:00.000Z"\n' +
      "emailCopy: false\n" +
      "---\n" +
      "\n" +
      "# Week 1\n" +
      "\n" +
      "Body text.\n";
    expect(week1?.content).toBe(expected);
  });

  it("emailCopy: null renders as an unquoted null, not a prose string", () => {
    const items: PackagedAnnouncement[] = [
      { week: 1, title: "Week 1", message: "Body text.", postAtIso: "2026-09-07T13:30:00.000Z" },
    ];
    const options: AnnouncementZipOptions = {
      courseName: "Intro to Astronomy",
      weekdayLabel: "Monday",
      postTimeLabel: "09:30",
      emailCopy: null,
      emailCopyNote: "Recorded: students are notified by their own LMS notification settings.",
    };
    const entries = buildAnnouncementZipEntries(items, options);
    const week1 = entries.find((e) => e.path === "week-01-announcement.md");
    const expected =
      "---\n" +
      "week: 1\n" +
      'postAt: "2026-09-07T13:30:00.000Z"\n' +
      "emailCopy: null\n" +
      "---\n" +
      "\n" +
      "# Week 1\n" +
      "\n" +
      "Body text.\n";
    expect(week1?.content).toBe(expected);
  });
});

describe("buildAnnouncementZipEntries - README always renders the human note, never the machine scalar", () => {
  it("prints emailCopyNote verbatim regardless of the emailCopy boolean value", () => {
    const items: PackagedAnnouncement[] = [
      { week: 1, title: "Week 1", message: "Body.", postAtIso: "2026-09-07T13:30:00.000Z" },
    ];
    const options: AnnouncementZipOptions = {
      courseName: "Intro to Astronomy",
      weekdayLabel: "Tuesday",
      postTimeLabel: "08:00",
      emailCopy: false,
      emailCopyNote: "Recorded: students will not be emailed a copy of each announcement.",
    };
    const entries = buildAnnouncementZipEntries(items, options);
    const readme = entries.find((e) => e.path === "README.md");
    expect(readme?.content).toContain(
      "Email copy: Recorded: students will not be emailed a copy of each announcement.\n"
    );
    // The README line is the human note - never the bare scalar "false".
    expect(readme?.content).not.toContain("Email copy: false");
    expect(readme?.content).not.toContain("Email copy: true");
    expect(readme?.content).not.toContain("Email copy: null");
  });
});

describe("buildAnnouncementZip - real JSZip archive", () => {
  it("produces a zip JSZip can reopen, with exactly the expected entry names", async () => {
    const { default: JSZip } = await import("jszip");
    const blob = await buildAnnouncementZip(TWO_WEEK_FIXTURE, BASE_OPTIONS);
    const reopened = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(reopened.files).sort();
    expect(names).toEqual(["README.md", "week-01-announcement.md", "week-02-announcement.md"]);
  });

  it("round-trips the exact per-week content through the real archive", async () => {
    const { default: JSZip } = await import("jszip");
    const blob = await buildAnnouncementZip(TWO_WEEK_FIXTURE, BASE_OPTIONS);
    const reopened = await JSZip.loadAsync(await blob.arrayBuffer());
    const week1Text = await reopened.file("week-01-announcement.md")?.async("string");
    expect(week1Text).toBe(EXPECTED_WEEK_01_CONTENT);
  });

  it("rejects an empty items array before ever touching JSZip", async () => {
    await expect(buildAnnouncementZip([], BASE_OPTIONS)).rejects.toThrow(
      "There are no announcements to package."
    );
  });
});
