// Tests for the announcement support added to the Common Cartridge writer
// (src/lib/workflows/common-cartridge.ts), per
// docs/weekly-announcement-package-io-acceptance-criteria.md AC3 items 17-20
// and docs/REGRESSION.md entry 240 ("Area baseline: the Common Cartridge
// writer").
//
// Entry 240 check 10 pins that the file's only prior test,
// common-cartridge.canvas.test.ts, exercises exactly three small exported
// helpers and never calls buildCommonCartridge, buildWeekCartridge, or
// emitContentItems - nothing in that suite builds a real zip. This file is
// therefore the first real coverage of buildCommonCartridge's actual zip
// assembly, so it reopens produced blobs with a real (unmocked) JSZip rather
// than asserting against internal state.
//
// FILEREADER POLYFILL REMOVED (docs/REGRESSION.md entry 241 check 13's fix,
// applied in common-cartridge.ts's emitContentItems): this file used to
// install a globalThis.FileReader polyfill in beforeAll/afterAll purely so
// its Blob-bearing fixtures (REGRESSION_FIXTURE_* near the bottom of this
// file, which include a real `files: [{ name, blob }]` entry) could build
// under Node. jszip's own Blob-reading path
// (node_modules/jszip/lib/utils.js:457, `exports.prepareContent`) gates the
// whole Blob-to-bytes conversion on `typeof FileReader !== "undefined"`,
// which vitest's "node" environment (vitest.config.ts) never provides -
// without a polyfill, jszip's `else` branch used to take over and reject
// with an error whose message starts "Can't read the data of ...". This
// module's file loop (emitContentItems, common-cartridge.ts) now converts
// every file's Blob to an ArrayBuffer itself, via `await
// file.blob.arrayBuffer()`, BEFORE handing it to jszip's zip.file() - so
// jszip's own Blob branch (and therefore its FileReader gate) is never
// reached for a file this app writes, in the browser or under Node. The
// polyfill is therefore unnecessary and has been removed; the "Blob file
// round-trip under Node" describe block below is the direct proof - it
// asserts `typeof FileReader === "undefined"` FIRST (so this proof cannot
// silently pass under a future browser-like test environment) and then
// proves a real Blob's bytes survive a full build-then-reopen round trip
// with no polyfill installed anywhere in this file or this repo.
import { describe, it, expect } from "vitest";
import {
  buildCommonCartridge,
  buildWeekCartridge,
  buildAnnouncementTopicXml,
  buildAnnouncementTopicMetaXml,
  buildAnnouncementsSidecarJson,
  TA_ANNOUNCEMENTS_SIDECAR_PATH,
  type CartridgeWeek,
  type AnnouncementSidecarEntry,
} from "./common-cartridge";
import { parseCartridgeBlob, detectAppGeneratedCartridge } from "@/lib/cartridge-import";

async function entryNames(blob: Blob): Promise<string[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return Object.keys(zip.files).sort();
}

async function readEntry(blob: Blob, path: string): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const entry = zip.file(path);
  if (!entry) throw new Error(`entry not found: ${path}`);
  return entry.async("string");
}

// ---------------------------------------------------------------------------
// FROZEN LITERAL expected XML - hand-written from AC3 item 18a/18b/18c, NOT
// derived from buildAnnouncementTopicXml/buildAnnouncementTopicMetaXml's own
// source, so a future edit that silently drifts the wire format away from
// the spec fails this test instead of trivially agreeing with itself.
// ---------------------------------------------------------------------------

const FROZEN_TOPIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imsdt_v1p1.xsd">
  <title>Week 1: Kickoff</title>
  <text texttype="text/html">&lt;p&gt;Welcome &amp; get started!&lt;/p&gt;</text>
</topic>`;

const FROZEN_TOPIC_META_XML = `<?xml version="1.0" encoding="UTF-8"?>
<topicMeta xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <topic_id>r0005</topic_id>
  <title>Week 1: Kickoff</title>
  <delayed_post_at>2026-08-24T13:00:00</delayed_post_at>
  <position>1</position>
  <type>announcement</type>
  <discussion_type>side_comment</discussion_type>
  <pinned>false</pinned>
  <workflow_state>active</workflow_state>
</topicMeta>`;

const FROZEN_TOPIC_META_XML_NO_DELAYED_POST_AT = `<?xml version="1.0" encoding="UTF-8"?>
<topicMeta xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <topic_id>r0005</topic_id>
  <title>Week 1: Kickoff</title>
  <position>1</position>
  <type>announcement</type>
  <discussion_type>side_comment</discussion_type>
  <pinned>false</pinned>
  <workflow_state>active</workflow_state>
</topicMeta>`;

describe("buildAnnouncementTopicXml - frozen literal (AC3 item 18a)", () => {
  it("matches the exact hand-written CC discussion-topic wire format", () => {
    const xml = buildAnnouncementTopicXml({
      title: "Week 1: Kickoff",
      html: "<p>Welcome & get started!</p>",
    });
    expect(xml).toBe(FROZEN_TOPIC_XML);
  });
});

describe("buildAnnouncementTopicMetaXml - frozen literal (AC3 item 18b/c)", () => {
  it("matches the exact hand-written Canvas topicMeta wire format, with delayed_post_at", () => {
    const xml = buildAnnouncementTopicMetaXml({
      identifier: "r0005",
      title: "Week 1: Kickoff",
      position: 1,
      postAtUtc: "2026-08-24T13:00:00",
    });
    expect(xml).toBe(FROZEN_TOPIC_META_XML);
  });

  it("omits delayed_post_at entirely when postAtUtc is absent", () => {
    const xml = buildAnnouncementTopicMetaXml({
      identifier: "r0005",
      title: "Week 1: Kickoff",
      position: 1,
    });
    expect(xml).toBe(FROZEN_TOPIC_META_XML_NO_DELAYED_POST_AT);
    expect(xml).not.toContain("<delayed_post_at>");
  });
});

// ---------------------------------------------------------------------------
// Real zip assembly through buildCommonCartridge, reopened with a real JSZip.
// ---------------------------------------------------------------------------

const ANNOUNCEMENT_ONLY_WEEK: CartridgeWeek = {
  week: 1,
  title: "Week 1",
  files: [],
  pages: [],
  assignments: [],
  announcements: [
    {
      title: "Week 1 Announcement",
      html: "<p>Hello class</p>",
      postAtUtc: "2026-08-24T13:00:00",
    },
  ],
};

describe("buildCommonCartridge - announcements, cc flavor", () => {
  it("emits exactly the topic resource file, no topicMeta file", async () => {
    const blob = await buildCommonCartridge("Test Course", [ANNOUNCEMENT_ONLY_WEEK], {
      flavor: "cc",
    });
    const names = await entryNames(blob);
    // DEFECT 2 fix: ANNOUNCEMENT_ONLY_WEEK carries one announcement, so the
    // AC4 item 27 sidecar (ta-announcements.json) is now always present
    // alongside the stamp (ta-cartridge-generated.json) - see
    // buildCommonCartridge's own comment at its `announcementSidecarEntries`
    // write for why "has announcements" (not "has emailCopy") is the gate.
    // Alphabetically, "ta-announcements.json" sorts before
    // "ta-cartridge-generated.json" ('a' < 'c' in the third path segment).
    expect(names).toEqual([
      "imsmanifest.xml",
      "resr0001/",
      "resr0001/topic.xml",
      "ta-announcements.json",
      "ta-cartridge-generated.json",
    ]);
    expect(names.some((n) => /topicMeta/i.test(n))).toBe(false);
  });

  it("registers the topic resource as imsdt_xmlv1p1 in the manifest, with no dependency", async () => {
    const blob = await buildCommonCartridge("Test Course", [ANNOUNCEMENT_ONLY_WEEK], {
      flavor: "cc",
    });
    const manifest = await readEntry(blob, "imsmanifest.xml");
    expect(manifest).toContain(
      '<resource identifier="r0001" type="imsdt_xmlv1p1" href="resr0001/topic.xml"><file href="resr0001/topic.xml"/></resource>'
    );
    expect(manifest).not.toContain("<dependency");
    expect(manifest).not.toContain("learning-application-resource");
  });

  it("the topic.xml body is the escaped announcement html", async () => {
    const blob = await buildCommonCartridge("Test Course", [ANNOUNCEMENT_ONLY_WEEK], {
      flavor: "cc",
    });
    const topicXml = await readEntry(blob, "resr0001/topic.xml");
    expect(topicXml).toContain("<title>Week 1 Announcement</title>");
    expect(topicXml).toContain(
      '<text texttype="text/html">&lt;p&gt;Hello class&lt;/p&gt;</text>'
    );
  });
});

describe("buildCommonCartridge - announcements, canvas flavor", () => {
  it("emits the topic resource file AND the topicMeta sibling", async () => {
    const blob = await buildCommonCartridge("Test Course", [ANNOUNCEMENT_ONLY_WEEK], {
      flavor: "canvas",
    });
    const names = await entryNames(blob);
    // DEFECT 2 fix: see the identical note in the cc-flavor version of this
    // test above - ta-announcements.json now always accompanies an
    // announcement-bearing build, sorting before ta-cartridge-generated.json
    // and after every "res..." path.
    expect(names).toEqual([
      "course_settings/",
      "course_settings/canvas_export.txt",
      "course_settings/module_meta.xml",
      "imsmanifest.xml",
      "resr0001/",
      "resr0001/topic.xml",
      "resr0001/topicMeta.xml",
      "ta-announcements.json",
      "ta-cartridge-generated.json",
    ]);
  });

  it("registers the LOR topicMeta resource and links it from the topic resource via <dependency>", async () => {
    const blob = await buildCommonCartridge("Test Course", [ANNOUNCEMENT_ONLY_WEEK], {
      flavor: "canvas",
    });
    const manifest = await readEntry(blob, "imsmanifest.xml");

    // The topic resource (r0001) carries a <dependency> pointing at the
    // topicMeta resource (r0002) - AC3 item 18d's linkage, Canvas's own.
    expect(manifest).toContain(
      '<resource identifier="r0001" type="imsdt_xmlv1p1" href="resr0001/topic.xml"><file href="resr0001/topic.xml"/><dependency identifierref="r0002"/></resource>'
    );
    expect(manifest).toContain(
      '<resource identifier="r0002" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="resr0001/topicMeta.xml"><file href="resr0001/topicMeta.xml"/></resource>'
    );
  });

  it("does NOT add the announcement to module_meta.xml (AC3 item 20)", async () => {
    const blob = await buildCommonCartridge("Test Course", [ANNOUNCEMENT_ONLY_WEEK], {
      flavor: "canvas",
    });
    const moduleMeta = await readEntry(blob, "course_settings/module_meta.xml");
    expect(moduleMeta).not.toContain("announcement");
    expect(moduleMeta).not.toContain("Week 1 Announcement");
    // No week module at all - the announcement-only week has zero
    // module-eligible items (files/pages/assignments), and announcements
    // themselves never become module items. (Note: the root element itself
    // is `<modules ...>`, so the check below looks for a `<module ` CHILD
    // element specifically, not just the substring "<module".)
    expect(moduleMeta).not.toContain("<module identifier");
  });

  it("delayed_post_at is present with postAtUtc and absent entirely without it", async () => {
    const withPostAt = await buildCommonCartridge("Test Course", [ANNOUNCEMENT_ONLY_WEEK], {
      flavor: "canvas",
    });
    const metaWithPostAt = await readEntry(withPostAt, "resr0001/topicMeta.xml");
    expect(metaWithPostAt).toContain("<delayed_post_at>2026-08-24T13:00:00</delayed_post_at>");

    const weekNoPostAt: CartridgeWeek = {
      ...ANNOUNCEMENT_ONLY_WEEK,
      announcements: [{ title: "Week 1 Announcement", html: "<p>Hello class</p>" }],
    };
    const withoutPostAt = await buildCommonCartridge("Test Course", [weekNoPostAt], {
      flavor: "canvas",
    });
    const metaWithoutPostAt = await readEntry(withoutPostAt, "resr0001/topicMeta.xml");
    expect(metaWithoutPostAt).not.toContain("<delayed_post_at>");
  });
});

describe("buildCommonCartridge - announcement text escaping", () => {
  it("escapes <, &, quotes and preserves a newline without corrupting the XML", async () => {
    const week: CartridgeWeek = {
      week: 1,
      title: "Week 1",
      files: [],
      pages: [],
      assignments: [],
      announcements: [
        {
          title: `Week 1 "Kickoff" <Reminder>`,
          html: `<p>Read &amp; review "chapter 1"</p>\n<p>See you <Monday>.</p>`,
          postAtUtc: "2026-08-24T13:00:00",
        },
      ],
    };

    const blob = await buildCommonCartridge("Test Course", [week], { flavor: "canvas" });

    // Round-trips through a real JSZip parse without throwing - if the
    // escaping were broken, the produced entries would not even be valid
    // zip/text content to read back.
    const topicXml = await readEntry(blob, "resr0001/topic.xml");
    const topicMetaXml = await readEntry(blob, "resr0001/topicMeta.xml");

    expect(topicXml).toContain("<title>Week 1 &quot;Kickoff&quot; &lt;Reminder&gt;</title>");
    expect(topicXml).toContain("&lt;p&gt;Read &amp;amp; review &quot;chapter 1&quot;&lt;/p&gt;");
    expect(topicXml).toContain("&lt;p&gt;See you &lt;Monday&gt;.&lt;/p&gt;");
    // The literal newline between the two <p> tags survives as a raw
    // newline in the escaped text (esc() never touches \n).
    expect(topicXml).toContain("&lt;/p&gt;\n&lt;p&gt;");

    expect(topicMetaXml).toContain(
      "<title>Week 1 &quot;Kickoff&quot; &lt;Reminder&gt;</title>"
    );

    // No raw (unescaped) '<' or '&' from the input content leaked into the
    // XML structure - every '<' in the file is part of a real tag.
    expect(topicXml).not.toMatch(/<Reminder>/);
    expect(topicXml).not.toMatch(/<Monday>/);
  });
});

// ---------------------------------------------------------------------------
// DEFECT 1 (adversarial-verification pass, confirmed): every announcement
// was written with <position>1</position> because emitAnnouncements computed
// `position: index + 1` off the index into THAT WEEK's OWN `announcements`
// array - since AC3 item 18 mandates exactly one announcement per week, that
// index was always 0, so position was literally always 1 for every week in
// every build. The fix moves the counter onto CartridgeState (the same place
// resourceId/itemId already live) so it increments across the WHOLE
// cartridge. This is the direct regression test: it MUST fail against the
// original `index + 1` code (verified by sabotage check - see this task's
// final report) and pass against the fix.
// ---------------------------------------------------------------------------

describe("buildCommonCartridge - announcement position (DEFECT 1 fix, AC3 item 18b)", () => {
  it("a 3-week canvas-flavor build assigns positions 1, 2, 3 across the whole cartridge, not 1 every week", async () => {
    const weeks: CartridgeWeek[] = [1, 2, 3].map((n) => ({
      week: n,
      title: `Week ${n}`,
      files: [],
      pages: [],
      assignments: [],
      announcements: [
        {
          title: `Week ${n} Announcement`,
          html: `<p>Week ${n} content</p>`,
          postAtUtc: `2026-08-${String(24 + (n - 1) * 7).padStart(2, "0")}T13:00:00`,
        },
      ],
    }));

    const blob = await buildCommonCartridge("Test Course", weeks, { flavor: "canvas" });

    // Each announcement-only week (no files/pages/assignments) consumes
    // exactly two resource ids in canvas flavor (topic + topicMeta - see
    // emitAnnouncements), and both files live under `res${topicResId}/`, so
    // the three weeks' topicMeta files land at resr0001, resr0003, resr0005
    // respectively. This is independent of the position bug under test -
    // resourceId already incremented correctly before this fix; only
    // <position> was wrong.
    const week1Meta = await readEntry(blob, "resr0001/topicMeta.xml");
    const week2Meta = await readEntry(blob, "resr0003/topicMeta.xml");
    const week3Meta = await readEntry(blob, "resr0005/topicMeta.xml");

    expect(week1Meta).toContain("<position>1</position>");
    expect(week2Meta).toContain("<position>2</position>");
    expect(week3Meta).toContain("<position>3</position>");

    // Belt-and-suspenders: also assert none of the three collapsed to the
    // pre-fix constant "1" for week 2/3 specifically (the exact failure mode
    // the adversarial pass proved).
    expect(week2Meta).not.toContain("<position>1</position>");
    expect(week3Meta).not.toContain("<position>1</position>");
  });
});

// ---------------------------------------------------------------------------
// DEFECT 2 (adversarial-verification pass, confirmed): AC4 item 27's
// email-copy setting had nowhere to go - CartridgeWeek.announcements carried
// no emailCopy field at all, so a resolved `{ value: true, honored: true }`
// choice was recorded NOWHERE in the package. Fix: CartridgeWeek.announcements
// widened with an optional emailCopy, and a new app-owned sidecar file
// (TA_ANNOUNCEMENTS_SIDECAR_PATH = "ta-announcements.json") records title,
// postAtUtc, resolved position, and emailCopy for every announcement -
// following the CARTRIDGE_STAMP_PATH precedent exactly: a fixed path, never
// registered as a manifest resource, so it is inert to every importer.
// ---------------------------------------------------------------------------

describe("buildCommonCartridge - ta-announcements.json sidecar (DEFECT 2 fix, AC4 item 27)", () => {
  // Two weeks, four announcements: week 1 carries the true/false pair, week
  // 2 carries the null/omitted pair. The live orchestrator
  // (steps.weekly-announcement-schedule.ts, AC3 item 18) only ever emits ONE
  // announcement per week - this fixture packs two into each week purely so
  // all four emailCopy states (true, false, explicit null, omitted-from-the-
  // object-entirely) are covered from a fixture that is still just "2
  // weeks," and so the position counter is exercised across BOTH a
  // within-week boundary (1->2) and an across-week boundary (2->3) in one
  // test. The writer itself (this file) places no one-per-week restriction
  // on CartridgeWeek.announcements; that restriction lives in the caller.
  const TWO_WEEK_MIXED_EMAIL_COPY: CartridgeWeek[] = [
    {
      week: 1,
      title: "Week 1",
      files: [],
      pages: [],
      assignments: [],
      announcements: [
        {
          title: "Week 1 Announcement A",
          html: "<p>A</p>",
          postAtUtc: "2026-08-24T13:00:00",
          emailCopy: true,
        },
        {
          title: "Week 1 Announcement B",
          html: "<p>B</p>",
          postAtUtc: "2026-08-24T14:00:00",
          emailCopy: false,
        },
      ],
    },
    {
      week: 2,
      title: "Week 2",
      files: [],
      pages: [],
      assignments: [],
      announcements: [
        {
          title: "Week 2 Announcement C",
          html: "<p>C</p>",
          postAtUtc: "2026-08-31T13:00:00",
          emailCopy: null,
        },
        {
          title: "Week 2 Announcement D",
          html: "<p>D</p>",
          postAtUtc: "2026-08-31T14:00:00",
          // emailCopy deliberately omitted - must normalize to JSON `null`,
          // never silently vanish from the entry (see emitAnnouncements'
          // `?? null` comment).
        },
      ],
    },
  ];

  it("records title, postAtUtc, resolved position, and emailCopy (true/false/null/omitted) as an exact parsed-JSON object", async () => {
    const blob = await buildCommonCartridge("Test Course", TWO_WEEK_MIXED_EMAIL_COPY, {
      flavor: "canvas",
    });
    const raw = await readEntry(blob, TA_ANNOUNCEMENTS_SIDECAR_PATH);

    expect(JSON.parse(raw)).toEqual({
      announcements: [
        {
          title: "Week 1 Announcement A",
          postAtUtc: "2026-08-24T13:00:00",
          position: 1,
          emailCopy: true,
        },
        {
          title: "Week 1 Announcement B",
          postAtUtc: "2026-08-24T14:00:00",
          position: 2,
          emailCopy: false,
        },
        {
          title: "Week 2 Announcement C",
          postAtUtc: "2026-08-31T13:00:00",
          position: 3,
          emailCopy: null,
        },
        {
          title: "Week 2 Announcement D",
          postAtUtc: "2026-08-31T14:00:00",
          position: 4,
          emailCopy: null,
        },
      ],
    });
  });

  it("is written identically for cc flavor - the sidecar is flavor-independent", async () => {
    const blob = await buildCommonCartridge("Test Course", TWO_WEEK_MIXED_EMAIL_COPY, {
      flavor: "cc",
    });
    const raw = await readEntry(blob, TA_ANNOUNCEMENTS_SIDECAR_PATH);
    const parsed = JSON.parse(raw) as { announcements: AnnouncementSidecarEntry[] };

    expect(parsed.announcements.map((a) => a.position)).toEqual([1, 2, 3, 4]);
    expect(parsed.announcements.map((a) => a.emailCopy)).toEqual([true, false, null, null]);
  });

  it("is absent entirely from a build with no announcements (byte-identical invariant, REGRESSION entry 240)", async () => {
    const week: CartridgeWeek = {
      week: 1,
      title: "Week 1",
      files: [],
      pages: [],
      assignments: [],
    };
    const blob = await buildCommonCartridge("Test Course", [week], { flavor: "canvas" });
    const names = await entryNames(blob);
    expect(names).not.toContain(TA_ANNOUNCEMENTS_SIDECAR_PATH);
  });

  it("IS written even when every present announcement omits emailCopy - deliberate choice: 'has announcements' is the gate, not 'has a non-null emailCopy somewhere', because the sidecar also carries position and postAt, which are real, always-present data the moment an announcement exists at all", async () => {
    const week: CartridgeWeek = {
      week: 1,
      title: "Week 1",
      files: [],
      pages: [],
      assignments: [],
      announcements: [
        { title: "No Email Copy Field", html: "<p>Hi</p>", postAtUtc: "2026-08-24T13:00:00" },
      ],
    };
    const blob = await buildCommonCartridge("Test Course", [week], { flavor: "canvas" });
    const names = await entryNames(blob);
    expect(names).toContain(TA_ANNOUNCEMENTS_SIDECAR_PATH);

    const raw = await readEntry(blob, TA_ANNOUNCEMENTS_SIDECAR_PATH);
    expect(JSON.parse(raw)).toEqual({
      announcements: [
        {
          title: "No Email Copy Field",
          postAtUtc: "2026-08-24T13:00:00",
          position: 1,
          emailCopy: null,
        },
      ],
    });
  });

  it("is never referenced inside imsmanifest.xml (stays inert, like the stamp)", async () => {
    const blob = await buildCommonCartridge("Test Course", [ANNOUNCEMENT_ONLY_WEEK], {
      flavor: "canvas",
    });
    const manifest = await readEntry(blob, "imsmanifest.xml");
    expect(manifest).not.toContain(TA_ANNOUNCEMENTS_SIDECAR_PATH);
    expect(manifest).not.toContain("ta-announcements");
  });
});

describe("buildAnnouncementsSidecarJson", () => {
  it("wraps entries under a single `announcements` key with no other fields", () => {
    const entries: AnnouncementSidecarEntry[] = [
      { title: "T", postAtUtc: null, position: 1, emailCopy: null },
    ];
    expect(JSON.parse(buildAnnouncementsSidecarJson(entries))).toEqual({
      announcements: entries,
    });
  });
});

// ---------------------------------------------------------------------------
// HYGIENE 4: the AC's own pre-implementation test 7
// (docs/weekly-announcement-package-io-acceptance-criteria.md, "Tests
// written BEFORE implementation" item 7) had no committed test. A built
// cartridge with announcements must parse back through parseCartridgeBlob
// (src/lib/cartridge-import.ts:357) without throwing, in BOTH flavors, and
// detectAppGeneratedCartridge (src/lib/cartridge-import.ts:487) must still
// return true for it - the self-consumption refusal (entries 202/206) must
// stay intact for an announcement-bearing cartridge exactly like it already
// does for every other cartridge this app writes.
// ---------------------------------------------------------------------------

describe("buildCommonCartridge - announcement round trip through parseCartridgeBlob (AC pre-implementation test 7)", () => {
  it("cc flavor: parses back without throwing and is still detected as app-generated", async () => {
    const blob = await buildCommonCartridge("Test Course", [ANNOUNCEMENT_ONLY_WEEK], {
      flavor: "cc",
    });

    const parsed = await parseCartridgeBlob(blob);
    expect(parsed).toBeTruthy();
    expect(parsed.appGenerated).toBe(true);

    expect(await detectAppGeneratedCartridge(blob)).toBe(true);
  });

  it("canvas flavor: parses back without throwing and is still detected as app-generated", async () => {
    const blob = await buildCommonCartridge("Test Course", [ANNOUNCEMENT_ONLY_WEEK], {
      flavor: "canvas",
    });

    const parsed = await parseCartridgeBlob(blob);
    expect(parsed).toBeTruthy();
    expect(parsed.appGenerated).toBe(true);

    expect(await detectAppGeneratedCartridge(blob)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No-announcements regression (entry 240 + this feature's own requirement):
// a CartridgeWeek with no `announcements` field, and one with an explicit
// empty array, must produce the EXACT same zip as buildCommonCartridge
// produced BEFORE this change. These entry-name arrays and this manifest
// string were captured by running the pre-change buildCommonCartridge
// against this exact fixture (a temporary throwaway test file, deleted
// before any src edits were made - never via `git stash`, per this task's
// own instructions) - they are not derived from the post-change code.
// ---------------------------------------------------------------------------

const REGRESSION_FIXTURE_FILE_BLOB = new Blob(["hello"]);

const REGRESSION_FIXTURE_WEEKS_BASE: Array<Omit<CartridgeWeek, "announcements">> = [
  {
    week: 1,
    title: "Week 1",
    files: [{ name: "handout.txt", blob: REGRESSION_FIXTURE_FILE_BLOB }],
    pages: [{ title: "Intro", html: "<p>Welcome</p>" }],
    assignments: [
      { title: "HW1", html: "<p>Do it</p>", points: 10, dueAt: "2026-08-24T04:59:00" },
    ],
  },
];

const FROZEN_PRE_CHANGE_CC_ENTRY_NAMES = [
  "imsmanifest.xml",
  "resr0002/",
  "resr0002/handout.txt",
  "resr0003/",
  "resr0003/assessment.xml",
  "ta-cartridge-generated.json",
  "wiki_content/",
  "wiki_content/p0001.html",
];

const FROZEN_PRE_CHANGE_CC_MANIFEST =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<manifest identifier="ta-cartridge" xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest">\n' +
  "  <metadata>\n" +
  "    <schema>IMS Common Cartridge</schema>\n" +
  "    <schemaversion>1.3.0</schemaversion>\n" +
  "    <lomimscc:lom>\n" +
  "      <lomimscc:general>\n" +
  "        <lomimscc:title>\n" +
  "          <lomimscc:string>Test Course</lomimscc:string>\n" +
  "        </lomimscc:title>\n" +
  "      </lomimscc:general>\n" +
  "    </lomimscc:lom>\n" +
  "  </metadata>\n" +
  "  <organizations>\n" +
  '    <organization identifier="org_1" structure="rooted-hierarchy">\n' +
  '      <item identifier="root">\n' +
  '        <item identifier="i0001"><title>Week 1</title><item identifier="i0002" identifierref="r0001"><title>Intro</title></item><item identifier="i0003" identifierref="r0002"><title>handout.txt</title></item><item identifier="i0004" identifierref="r0003"><title>HW1</title></item></item>\n' +
  "      </item>\n" +
  "    </organization>\n" +
  "  </organizations>\n" +
  "  <resources>\n" +
  '    <resource identifier="r0001" type="webcontent" href="wiki_content/p0001.html"><file href="wiki_content/p0001.html"/></resource>\n' +
  '    <resource identifier="r0002" type="webcontent" href="resr0002/handout.txt"><file href="resr0002/handout.txt"/></resource>\n' +
  '    <resource identifier="r0003" type="imsqti_xmlv1p2/imscc_xmlv1p3/assessment" href="resr0003/assessment.xml"><file href="resr0003/assessment.xml"/></resource>\n' +
  "  </resources>\n" +
  "</manifest>";

const FROZEN_PRE_CHANGE_CANVAS_ENTRY_NAMES = [
  "course_settings/",
  "course_settings/canvas_export.txt",
  "course_settings/module_meta.xml",
  "imsmanifest.xml",
  "resr0003/",
  "resr0003/assignment.html",
  "resr0003/assignment_settings.xml",
  "ta-cartridge-generated.json",
  "web_resources/",
  "web_resources/resr0002/",
  "web_resources/resr0002/handout.txt",
  "wiki_content/",
  "wiki_content/p0001.html",
];

const FROZEN_PRE_CHANGE_CANVAS_MANIFEST =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<manifest identifier="ta-cartridge" xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest">\n' +
  "  <metadata>\n" +
  "    <schema>IMS Common Cartridge</schema>\n" +
  "    <schemaversion>1.3.0</schemaversion>\n" +
  "    <lomimscc:lom>\n" +
  "      <lomimscc:general>\n" +
  "        <lomimscc:title>\n" +
  "          <lomimscc:string>Test Course</lomimscc:string>\n" +
  "        </lomimscc:title>\n" +
  "      </lomimscc:general>\n" +
  "    </lomimscc:lom>\n" +
  "  </metadata>\n" +
  "  <organizations>\n" +
  '    <organization identifier="org_1" structure="rooted-hierarchy">\n' +
  '      <item identifier="root">\n' +
  '        <item identifier="i0001"><title>Week 1</title><item identifier="i0002" identifierref="r0001"><title>Intro</title></item><item identifier="i0003" identifierref="r0002"><title>handout.txt</title></item><item identifier="i0004" identifierref="r0003"><title>HW1</title></item></item>\n' +
  "      </item>\n" +
  "    </organization>\n" +
  "  </organizations>\n" +
  "  <resources>\n" +
  '    <resource identifier="r0001" type="webcontent" href="wiki_content/p0001.html"><file href="wiki_content/p0001.html"/></resource>\n' +
  '    <resource identifier="r0002" type="webcontent" href="web_resources/resr0002/handout.txt"><file href="web_resources/resr0002/handout.txt"/></resource>\n' +
  '    <resource identifier="r0003" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="resr0003/assignment.html"><file href="resr0003/assignment.html"/><file href="resr0003/assignment_settings.xml"/></resource>\n' +
  '    <resource identifier="co_settings" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="course_settings/canvas_export.txt"><file href="course_settings/canvas_export.txt"/><file href="course_settings/module_meta.xml"/></resource>\n' +
  "  </resources>\n" +
  "</manifest>";

describe("buildCommonCartridge - no-announcements regression (entry 240)", () => {
  it("cc flavor: `announcements` absent produces the exact pre-change zip", async () => {
    const weeks: CartridgeWeek[] = REGRESSION_FIXTURE_WEEKS_BASE.map((w) => ({ ...w }));
    const blob = await buildCommonCartridge("Test Course", weeks, { flavor: "cc" });
    expect(await entryNames(blob)).toEqual(FROZEN_PRE_CHANGE_CC_ENTRY_NAMES);
    expect(await readEntry(blob, "imsmanifest.xml")).toBe(FROZEN_PRE_CHANGE_CC_MANIFEST);
  });

  it("cc flavor: `announcements: []` produces the exact pre-change zip", async () => {
    const weeks: CartridgeWeek[] = REGRESSION_FIXTURE_WEEKS_BASE.map((w) => ({
      ...w,
      announcements: [],
    }));
    const blob = await buildCommonCartridge("Test Course", weeks, { flavor: "cc" });
    expect(await entryNames(blob)).toEqual(FROZEN_PRE_CHANGE_CC_ENTRY_NAMES);
    expect(await readEntry(blob, "imsmanifest.xml")).toBe(FROZEN_PRE_CHANGE_CC_MANIFEST);
  });

  it("canvas flavor: `announcements` absent produces the exact pre-change zip", async () => {
    const weeks: CartridgeWeek[] = REGRESSION_FIXTURE_WEEKS_BASE.map((w) => ({ ...w }));
    const blob = await buildCommonCartridge("Test Course", weeks, { flavor: "canvas" });
    expect(await entryNames(blob)).toEqual(FROZEN_PRE_CHANGE_CANVAS_ENTRY_NAMES);
    expect(await readEntry(blob, "imsmanifest.xml")).toBe(FROZEN_PRE_CHANGE_CANVAS_MANIFEST);
  });

  it("canvas flavor: `announcements: []` produces the exact pre-change zip", async () => {
    const weeks: CartridgeWeek[] = REGRESSION_FIXTURE_WEEKS_BASE.map((w) => ({
      ...w,
      announcements: [],
    }));
    const blob = await buildCommonCartridge("Test Course", weeks, { flavor: "canvas" });
    expect(await entryNames(blob)).toEqual(FROZEN_PRE_CHANGE_CANVAS_ENTRY_NAMES);
    expect(await readEntry(blob, "imsmanifest.xml")).toBe(FROZEN_PRE_CHANGE_CANVAS_MANIFEST);
  });
});

// ---------------------------------------------------------------------------
// docs/REGRESSION.md entry 241 check 13 fix - THE direct, no-polyfill proof.
// Both buildCommonCartridge and buildWeekCartridge share the same
// module-private emitContentItems (common-cartridge.ts) for their file-
// writing loop, so one round-trip test per builder covers both call sites.
// No globalThis.FileReader polyfill is installed anywhere in this file (the
// one that used to exist here was removed as part of this fix - see this
// file's own header comment) or anywhere else in this repo's test suite for
// this path, so a pass here is a pass under the exact conditions a real
// unattended/server run faces.
// ---------------------------------------------------------------------------

describe("buildCommonCartridge / buildWeekCartridge - Blob file round-trip under Node, no FileReader polyfill (entry 241 check 13 fix)", () => {
  it("typeof FileReader is undefined in this vitest node environment (so the round-trip tests below cannot silently pass under a future browser-like test env)", () => {
    expect(typeof FileReader).toBe("undefined");
  });

  // Deliberately includes bytes a naive string round trip would corrupt
  // (0x00, and values above the ASCII range) - a real docx/pptx/zip payload
  // is binary, not text, so this fixture proves the fix preserves arbitrary
  // bytes exactly, not just printable ones.
  const REAL_BYTES = new Uint8Array([0, 1, 2, 3, 127, 128, 200, 253, 254, 255, 65, 66, 67]);

  it("buildCommonCartridge packages a real Blob file and the bytes round-trip back exactly", async () => {
    const week: CartridgeWeek = {
      week: 1,
      title: "Week 1",
      files: [{ name: "handout.bin", blob: new Blob([REAL_BYTES]) }],
      pages: [],
      assignments: [],
    };

    // Before the fix this line rejected under Node with jszip's "Can't read
    // the data of 'resr0001/handout.bin'. Is it in a supported JavaScript
    // type (String, Blob, ArrayBuffer, etc) ?" - proven by the sabotage
    // check recorded in this task's own report.
    const blob = await buildCommonCartridge("Test Course", [week], { flavor: "cc" });

    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const entry = zip.file("resr0001/handout.bin");
    expect(entry).toBeTruthy();
    const roundTripped = await entry!.async("uint8array");
    expect(Array.from(roundTripped)).toEqual(Array.from(REAL_BYTES));
  });

  it("buildWeekCartridge packages a real Blob file and the bytes round-trip back exactly", async () => {
    const blob = await buildWeekCartridge(
      "Week 1",
      [{ name: "handout.bin", blob: new Blob([REAL_BYTES]) }],
      [],
      []
    );

    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const entry = zip.file("resr0001/handout.bin");
    expect(entry).toBeTruthy();
    const roundTripped = await entry!.async("uint8array");
    expect(Array.from(roundTripped)).toEqual(Array.from(REAL_BYTES));
  });
});
