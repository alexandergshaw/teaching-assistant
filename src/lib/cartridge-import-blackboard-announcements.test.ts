import { describe, it, expect } from "vitest";
import {
  parseBlackboardAnnouncements,
  resolveBlackboardAnnouncements,
} from "./cartridge-import-blackboard-announcements";
import type { BlackboardResourceEntry } from "./cartridge-import-blackboard-body";
import { parseCartridgeBlob } from "./cartridge-import";

// Fixtures below use the UPPERCASE element casing verified against the
// instructor's real archive (docs/blackboard-announcements-acceptance-
// criteria.md: "The observed casing here is <ANNOUNCEMENT>, <TITLE>,
// <DESCRIPTION>, <TEXT>, <DATES>, <RESTRICTSTART>, <ORDERNUM>, <ISDRAFT> -
// upper"), NOT a casing chosen to make the parser pass - the file's own
// case-insensitivity test below (using a deliberately different casing)
// exists specifically to avoid the entry 302 near miss (an upper-only
// matcher that passed every synthetic test written in the same casing and
// returned nothing from the real archive).

function announcementXml(fields: {
  title?: string;
  order?: string;
  isDraft?: string;
  releaseDate?: string;
  bodyEscapedHtml?: string;
}): string {
  const {
    title = "Week 1 - Course Setup and Development Workflow",
    order = "1",
    isDraft = "true",
    releaseDate = "2026-08-17 04:30:00 MDT",
    bodyEscapedHtml = "&lt;p&gt;Hi everyone,&lt;/p&gt;&lt;p&gt;&lt;strong&gt;This week: Week 1&lt;/strong&gt;&lt;/p&gt;&lt;p&gt;Welcome to the course.&lt;/p&gt;&lt;h3&gt;What to focus on this week:&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Read chapter 1&lt;/li&gt;&lt;li&gt;Set up your dev environment&lt;/li&gt;&lt;li&gt;Post an introduction&lt;/li&gt;&lt;/ul&gt;",
  } = fields;
  return `<ANNOUNCEMENT><TITLE value="${title}"/><DESCRIPTION><TEXT>${bodyEscapedHtml}</TEXT></DESCRIPTION><DATES><RESTRICTSTART value="${releaseDate}"/><CREATED value="2026-08-01 00:00:00 MDT"/></DATES><ORDERNUM value="${order}"/><ISDRAFT value="${isDraft}"/></ANNOUNCEMENT>`;
}

describe("parseBlackboardAnnouncements", () => {
  it("parses title, order, isDraft, and the raw release-date string from a fully-populated announcement", () => {
    const [a] = parseBlackboardAnnouncements(announcementXml({}));
    expect(a.title).toBe("Week 1 - Course Setup and Development Workflow");
    expect(a.order).toBe(1);
    expect(a.isDraft).toBe(true);
    // Verbatim, byte-for-byte - never touched by a Date conversion. See
    // CartridgeAnnouncement.releaseDate's own doc comment for why.
    expect(a.releaseDate).toBe("2026-08-17 04:30:00 MDT");
  });

  it("decodes the body free of tag noise and unresolved entities, keeping the actual prose", () => {
    const [a] = parseBlackboardAnnouncements(announcementXml({}));
    expect(a.body).not.toContain("<");
    expect(a.body).not.toContain(">");
    expect(a.body).not.toContain("&lt;");
    expect(a.body).toContain("Hi everyone,");
    expect(a.body).toContain("This week: Week 1");
    expect(a.body).toContain("What to focus on this week:");
    expect(a.body).toContain("Read chapter 1");
    expect(a.body).toContain("Post an introduction");
  });

  it("carries a missing/non-numeric ORDERNUM as null, never a fabricated 0", () => {
    const noOrder = announcementXml({}).replace('<ORDERNUM value="1"/>', "");
    const [a] = parseBlackboardAnnouncements(noOrder);
    expect(a.order).toBeNull();
  });

  it("handles a missing title and an empty body honestly - the announcement is kept, not dropped", () => {
    const noTitleNoBody = `<ANNOUNCEMENT><DESCRIPTION><TEXT></TEXT></DESCRIPTION><DATES><RESTRICTSTART value="2026-08-24 04:30:00 MDT"/></DATES><ORDERNUM value="2"/><ISDRAFT value="true"/></ANNOUNCEMENT>`;
    const parsed = parseBlackboardAnnouncements(noTitleNoBody);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("");
    expect(parsed[0].body).toBe("");
    expect(parsed[0].order).toBe(2);
  });

  it("parses correctly even when DATES/RESTRICTSTART is entirely absent - releaseDate is null, not a throw", () => {
    const noDates = `<ANNOUNCEMENT><TITLE value="No date"/><DESCRIPTION><TEXT>&lt;p&gt;Body&lt;/p&gt;</TEXT></DESCRIPTION><ORDERNUM value="5"/><ISDRAFT value="true"/></ANNOUNCEMENT>`;
    const [a] = parseBlackboardAnnouncements(noDates);
    expect(a.releaseDate).toBeNull();
    expect(a.title).toBe("No date");
  });

  it("CASE-INSENSITIVE MATCHING (the entry 302 near miss, guarded against): a mixed/lower casing document still parses fully", () => {
    // Deliberately NOT the observed real casing - proves the matcher does
    // not silently depend on the specific uppercase convention every other
    // fixture in this file happens to use.
    const mixedCase = `<Announcement><title value="Week 2 - Loops"/><Description><text>&lt;p&gt;Mixed casing body&lt;/p&gt;</text></Description><dates><RestrictStart value="2026-08-24 04:30:00 MDT"/></dates><ordernum value="2"/><IsDraft value="TRUE"/></Announcement>`;
    const [a] = parseBlackboardAnnouncements(mixedCase);
    expect(a.title).toBe("Week 2 - Loops");
    expect(a.body).toBe("Mixed casing body");
    expect(a.order).toBe(2);
    expect(a.isDraft).toBe(true);
    expect(a.releaseDate).toBe("2026-08-24 04:30:00 MDT");
  });
});

describe("resolveBlackboardAnnouncements", () => {
  function resourceMap(entries: [string, BlackboardResourceEntry][]): Map<string, BlackboardResourceEntry> {
    return new Map(entries);
  }

  it("collects announcements from every matching resource and sorts by ORDERNUM numerically, NOT by resource filename or Map iteration order", async () => {
    // Filename/insertion order is res00031 -> res00032 -> res00033 (matching
    // typical manifest declaration order), but ORDERNUM order disagrees:
    // res00032 is order 1, res00033 is order 2, res00031 is order 3. A
    // sort keyed on filename or plain iteration order would yield
    // ["A", "B", "C"]; the correct ORDERNUM-keyed sort yields ["B", "C", "A"].
    const resources = resourceMap([
      ["res00031", { type: "resource/x-bb-announcement", bbFile: "res00031.dat", bbTitle: null }],
      ["res00032", { type: "resource/x-bb-announcement", bbFile: "res00032.dat", bbTitle: null }],
      ["res00033", { type: "resource/x-bb-announcement", bbFile: "res00033.dat", bbTitle: null }],
    ]);
    const files: Record<string, string> = {
      "res00031.dat": announcementXml({ title: "A", order: "3" }),
      "res00032.dat": announcementXml({ title: "B", order: "1" }),
      "res00033.dat": announcementXml({ title: "C", order: "2" }),
    };
    const readEntry = async (path: string) => files[path] ?? null;

    const announcements = await resolveBlackboardAnnouncements(resources, readEntry);
    expect(announcements.map((a) => a.title)).toEqual(["B", "C", "A"]);
    expect(announcements.map((a) => a.order)).toEqual([1, 2, 3]);
  });

  it("sorts an announcement with no ORDERNUM LAST rather than dropping it", async () => {
    const resources = resourceMap([
      ["res00031", { type: "resource/x-bb-announcement", bbFile: "res00031.dat", bbTitle: null }],
      ["res00032", { type: "resource/x-bb-announcement", bbFile: "res00032.dat", bbTitle: null }],
    ]);
    const files: Record<string, string> = {
      "res00031.dat": announcementXml({ title: "Has order", order: "1" }),
      "res00032.dat": announcementXml({ title: "No order" }).replace('<ORDERNUM value="1"/>', ""),
    };
    const readEntry = async (path: string) => files[path] ?? null;

    const announcements = await resolveBlackboardAnnouncements(resources, readEntry);
    expect(announcements.map((a) => a.title)).toEqual(["Has order", "No order"]);
    expect(announcements[1].order).toBeNull();
  });

  it("skips a resource whose type does not mention 'announcement', case-insensitively matching one that does", async () => {
    const resources = resourceMap([
      ["res00001", { type: "course/x-bb-coursesetting", bbFile: "res00001.dat", bbTitle: "Test Course" }],
      ["res00031", { type: "Resource/X-BB-Announcement", bbFile: "res00031.dat", bbTitle: null }],
    ]);
    const files: Record<string, string> = {
      "res00001.dat": "<COURSE><DESCRIPTION>ignored</DESCRIPTION></COURSE>",
      "res00031.dat": announcementXml({ title: "Only real one" }),
    };
    const readEntry = async (path: string) => files[path] ?? null;

    const announcements = await resolveBlackboardAnnouncements(resources, readEntry);
    expect(announcements.map((a) => a.title)).toEqual(["Only real one"]);
  });

  it("yields an empty array (not a throw) when no resource type mentions announcement", async () => {
    const resources = resourceMap([
      ["res00001", { type: "course/x-bb-coursesetting", bbFile: "res00001.dat", bbTitle: "Test Course" }],
    ]);
    const announcements = await resolveBlackboardAnnouncements(resources, async () => null);
    expect(announcements).toEqual([]);
  });
});

// End-to-end wiring through parseBlackboardArchive/parseCartridgeBlob - the
// announcement resource is declared in <resources> but referenced from NO
// <organizations> item, mirroring how the rubric resource integration test
// above (BLACKBOARD_RUBRIC_RESOURCE_MANIFEST_XML) is wired, and matching
// the real archive's own shape (docs/blackboard-announcements-acceptance-
// criteria.md: "NONE referenced from <organizations>").
const BLACKBOARD_MANIFEST_WITH_ANNOUNCEMENTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="man00001" xmlns:bb="http://www.blackboard.com/content-packaging/"><organizations
   default="toc00001"><organization identifier="toc00001"><item identifier="itm00001"
     identifierref="res00006"><title>ROOT</title><item identifier="itm00004"
      identifierref="res00015"><title>--TOP--</title><item identifier="itm00006"
       identifierref="res00017"><title>Module 1</title></item></item></item></organization></organizations><resources><resource
   bb:file="res00001.dat" bb:title="Test Course" identifier="res00001" type="course/x-bb-coursesetting"
   xml:base="res00001"/><resource bb:file="res00006.dat" bb:title="ROOT" identifier="res00006"
   type="course/x-bb-coursetoc" xml:base="res00006"/><resource bb:file="res00015.dat" bb:title="--TOP--"
   identifier="res00015" type="resource/x-bb-folder" xml:base="res00015"/><resource bb:file="res00017.dat"
   bb:title="Module 1" identifier="res00017" type="resource/x-bb-lesson" xml:base="res00017"/><resource
   bb:file="res00031.dat" identifier="res00031" type="resource/x-bb-announcement" xml:base="res00031"/><resource
   bb:file="res00032.dat" identifier="res00032" type="resource/x-bb-announcement"
   xml:base="res00032"/></resources></manifest>`;

const BLACKBOARD_COURSE_RECORD_XML = `<COURSE><TITLE value="Test Course"/><DESCRIPTION>A test description</DESCRIPTION></COURSE>`;
const BLACKBOARD_SCAFFOLD_CONTENT_XML = `<CONTENT><CONTENTHANDLER value="resource/x-bb-folder"/></CONTENT>`;
const BLACKBOARD_LESSON_CONTENT_XML = `<CONTENT><CONTENTHANDLER value="resource/x-bb-lesson"/></CONTENT>`;

describe("parseCartridgeBlob - Blackboard archive - announcement resolution", () => {
  it("recovers announcements not referenced from <organizations>, sorted by ORDERNUM, onto CartridgeCourseData", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", BLACKBOARD_MANIFEST_WITH_ANNOUNCEMENTS_XML);
    zip.file("res00001.dat", BLACKBOARD_COURSE_RECORD_XML);
    zip.file("res00006.dat", BLACKBOARD_SCAFFOLD_CONTENT_XML);
    zip.file("res00015.dat", BLACKBOARD_SCAFFOLD_CONTENT_XML);
    zip.file("res00017.dat", BLACKBOARD_LESSON_CONTENT_XML);
    // Filename order (res00031 then res00032) disagrees with ORDERNUM
    // (res00032 is order 1, res00031 is order 2) - same discipline as the
    // unit test above, carried through the real parseCartridgeBlob entry
    // point rather than only the unit-level resolver.
    zip.file("res00031.dat", announcementXml({ title: "Week 2", order: "2" }));
    zip.file("res00032.dat", announcementXml({ title: "Week 1", order: "1" }));
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.announcements).toBeDefined();
    expect(data.announcements?.map((a) => a.title)).toEqual(["Week 1", "Week 2"]);
    expect(data.announcements?.map((a) => a.order)).toEqual([1, 2]);
    // Regular module/item parsing is unaffected by the announcement
    // resources sitting unreferenced in <resources> (AC8).
    expect(data.modules.map((m) => m.name)).toEqual(["Module 1"]);
  });

  it("yields an empty announcements array (not a throw, not undefined) when no resource type mentions announcement", async () => {
    const { default: JSZip } = await import("jszip");
    const noAnnouncementsManifest = BLACKBOARD_MANIFEST_WITH_ANNOUNCEMENTS_XML.replace(
      /<resource\s+bb:file="res0003[12]\.dat"[\s\S]*?\/>/g,
      ""
    );
    const zip = new JSZip();
    zip.file("imsmanifest.xml", noAnnouncementsManifest);
    zip.file("res00001.dat", BLACKBOARD_COURSE_RECORD_XML);
    zip.file("res00006.dat", BLACKBOARD_SCAFFOLD_CONTENT_XML);
    zip.file("res00015.dat", BLACKBOARD_SCAFFOLD_CONTENT_XML);
    zip.file("res00017.dat", BLACKBOARD_LESSON_CONTENT_XML);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.announcements).toEqual([]);
  });
});
