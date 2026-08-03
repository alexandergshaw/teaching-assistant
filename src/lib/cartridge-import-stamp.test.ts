import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  CARTRIDGE_STAMP_APP_ID,
  CARTRIDGE_STAMP_PATH,
  buildCartridgeStampJson,
  readCartridgeStamp,
} from "./cartridge-import-stamp";
import { detectAppGeneratedCartridge, parseCartridgeBlob } from "./cartridge-import";
import { buildCommonCartridge, buildWeekCartridge } from "./workflows/common-cartridge";

// Ground truth: a real Canvas course export (26SS_INFO_1020_2A - Computer
// Science Principles, 12 modules), downloaded from a live Canvas course.
// Only present on this dev machine, so every assertion against it is guarded
// with `it.skipIf` rather than hard-coded into the portable suite - the
// synthetic REAL_CANVAS_SHAPE fixture below (whose exact file list and
// manifest namespace were read off this same real export) is what keeps the
// no-false-positive guarantee checked on every machine, CI included.
const REAL_CANVAS_EXPORT_PATH =
  "C:\\Users\\alexa\\Downloads\\26ss-info-1020-2a-computer-science-principles-export (1).imscc";
const hasRealCanvasExport = fs.existsSync(REAL_CANVAS_EXPORT_PATH);

describe("buildCartridgeStampJson / readCartridgeStamp", () => {
  it("round-trips a stamp this app wrote", () => {
    const json = buildCartridgeStampJson({ title: "26SS_INFO_1020_2A" });
    const stamp = readCartridgeStamp(json);
    expect(stamp).not.toBeNull();
    expect(stamp?.app).toBe(CARTRIDGE_STAMP_APP_ID);
    expect(stamp?.generatedBy).toBe("Course Build");
    expect(stamp?.title).toBe("26SS_INFO_1020_2A");
    expect(typeof stamp?.generatedAt).toBe("string");
    expect(stamp?.generatedAt.length).toBeGreaterThan(0);
  });

  it("stores no title when none is given", () => {
    const stamp = readCartridgeStamp(buildCartridgeStampJson({}));
    expect(stamp?.title).toBeNull();
  });

  it("stores no title for a blank/whitespace-only title", () => {
    const stamp = readCartridgeStamp(buildCartridgeStampJson({ title: "   " }));
    expect(stamp?.title).toBeNull();
  });

  it("returns null for absent content", () => {
    expect(readCartridgeStamp(null)).toBeNull();
    expect(readCartridgeStamp(undefined)).toBeNull();
    expect(readCartridgeStamp("")).toBeNull();
    expect(readCartridgeStamp("   ")).toBeNull();
  });

  it("returns null for malformed JSON rather than throwing", () => {
    expect(() => readCartridgeStamp("{not valid json")).not.toThrow();
    expect(readCartridgeStamp("{not valid json")).toBeNull();
  });

  it("returns null for well-formed JSON that is not an object", () => {
    expect(readCartridgeStamp("42")).toBeNull();
    expect(readCartridgeStamp('"a string"')).toBeNull();
    expect(readCartridgeStamp("[1,2,3]")).toBeNull();
    expect(readCartridgeStamp("null")).toBeNull();
  });

  it("returns null when the app id does not match, even with everything else present", () => {
    const spoofed = JSON.stringify({
      app: "some-other-app",
      generatedBy: "Course Build",
      kind: "course-cartridge",
      stampVersion: 1,
      generatedAt: new Date().toISOString(),
      title: "Spoofed",
    });
    expect(readCartridgeStamp(spoofed)).toBeNull();
  });

  it("returns null when kind does not match", () => {
    const wrongKind = JSON.stringify({ app: CARTRIDGE_STAMP_APP_ID, kind: "something-else" });
    expect(readCartridgeStamp(wrongKind)).toBeNull();
  });

  it("tolerates a future stampVersion instead of rejecting it", () => {
    const future = JSON.stringify({
      app: CARTRIDGE_STAMP_APP_ID,
      kind: "course-cartridge",
      stampVersion: 99,
      generatedAt: "2099-01-01T00:00:00.000Z",
      title: null,
    });
    const stamp = readCartridgeStamp(future);
    expect(stamp).not.toBeNull();
    expect(stamp?.stampVersion).toBe(99);
  });
});

describe("detectAppGeneratedCartridge - round trip through the real writer", () => {
  it("detects a cartridge built by buildCommonCartridge (cc flavor)", async () => {
    const blob = await buildCommonCartridge("INFO 1020 - Computer Science Principles", [
      {
        week: 1,
        title: "Module 01: Intro",
        files: [],
        pages: [{ title: "Welcome", html: "<p>Hi</p>" }],
        assignments: [],
      },
    ]);
    expect(await detectAppGeneratedCartridge(blob)).toBe(true);
  });

  it("detects a cartridge built by buildCommonCartridge (canvas flavor)", async () => {
    const blob = await buildCommonCartridge(
      "INFO 1020 - Computer Science Principles",
      [
        {
          week: 1,
          title: "Module 01: Intro",
          files: [],
          pages: [],
          assignments: [{ title: "Week 1 Assignment", html: "<p>Do it</p>", points: 10 }],
        },
      ],
      { flavor: "canvas" }
    );
    expect(await detectAppGeneratedCartridge(blob)).toBe(true);
  });

  it("detects a cartridge built by buildWeekCartridge", async () => {
    const blob = await buildWeekCartridge(
      "Week 1",
      [],
      [{ title: "Assignment", html: "<p>Text</p>", points: 5 }],
      []
    );
    expect(await detectAppGeneratedCartridge(blob)).toBe(true);
  });

  it("survives a genuine zip round trip (rezip of the exact bytes, as a download+re-upload would produce)", async () => {
    const { default: JSZip } = await import("jszip");
    const original = await buildCommonCartridge("Roundtrip Course", [
      { week: 1, title: "Week 1", files: [], pages: [], assignments: [] },
    ]);

    // Simulate "download the file, then upload the exact same bytes back" -
    // no re-zipping tool involved, just the same archive read back in.
    const reloaded = await JSZip.loadAsync(await original.arrayBuffer());
    const rebytes = await reloaded.generateAsync({ type: "blob" });

    expect(await detectAppGeneratedCartridge(rebytes)).toBe(true);
  });

  it("wires appGenerated: true into parseCartridgeBlob's result for the app's own output", async () => {
    const blob = await buildCommonCartridge("Wired Course", [
      { week: 1, title: "Week 1", files: [], pages: [], assignments: [] },
    ]);
    const data = await parseCartridgeBlob(blob);
    expect(data.appGenerated).toBe(true);
  });
});

describe("detectAppGeneratedCartridge - does not false-positive on a real Canvas export", () => {
  // Synthetic fixture whose shape was read directly off the real 26SS_INFO_1020_2A
  // export named in this task's ground truth (course_settings/ file list,
  // manifest namespace/identifier shape, and the fact that canvas_export.txt
  // carries arbitrary human text rather than anything this app would write) -
  // kept inline (not the real 61MB file) so this assertion runs everywhere,
  // not just on the one machine that happens to have the download.
  const REAL_CANVAS_SHAPE_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="g365ec9bb935c431fc07296d3b23f286f" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title><lomimscc:string>26SS_INFO_1020_2A - Computer Science &amp; Principles</lomimscc:string></lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="root"></item>
    </organization>
  </organizations>
  <resources></resources>
</manifest>`;

  async function buildRealShapedCanvasZip() {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", REAL_CANVAS_SHAPE_MANIFEST);
    zip.file(
      "course_settings/canvas_export.txt",
      "Q: What did the panda say when he was forced out of his natural habitat?\nA: This is un-BEAR-able"
    );
    zip.file("course_settings/course_settings.xml", "<course></course>");
    zip.file("course_settings/module_meta.xml", "<modules></modules>");
    zip.file("course_settings/rubrics.xml", "<rubrics></rubrics>");
    zip.file("course_settings/assignment_groups.xml", "<assignmentGroups></assignmentGroups>");
    zip.file("course_settings/context.xml", "<webcontent></webcontent>");
    zip.file("course_settings/files_meta.xml", "<fileMeta></fileMeta>");
    zip.file("course_settings/late_policy.xml", "<latePolicy></latePolicy>");
    zip.file("course_settings/media_tracks.xml", "<media_tracks></media_tracks>");
    zip.file("course_settings/syllabus.html", "<html><body>Syllabus</body></html>");
    // A handful of Canvas's opaque gNNNN...-hashed resource folders, exactly
    // as the real export names them - proves an unrelated hash-named entry
    // cannot be mistaken for the stamp path.
    zip.file("g7db8c94d1acfa7b47cf79a901fe19f1f/assignment.html", "<html></html>");
    zip.file("web_resources/g0f96a7a7e91411aa3c8becdae2cbe4a2/slides.pptx", "binary");
    return zip;
  }

  it("does not detect the synthetic real-Canvas-shaped export as app-generated", async () => {
    const zip = await buildRealShapedCanvasZip();
    const bytes = await zip.generateAsync({ type: "blob" });
    expect(await detectAppGeneratedCartridge(bytes)).toBe(false);
  });

  it("leaves appGenerated false/undefined via parseCartridgeBlob for the same fixture", async () => {
    const zip = await buildRealShapedCanvasZip();
    const bytes = await zip.generateAsync({ type: "blob" });
    const data = await parseCartridgeBlob(bytes);
    expect(data.appGenerated ?? false).toBe(false);
  });

  it.skipIf(!hasRealCanvasExport)(
    "does not detect the ACTUAL downloaded Canvas export as app-generated",
    async () => {
      const bytes = fs.readFileSync(REAL_CANVAS_EXPORT_PATH);
      const blob = new Blob([bytes], { type: "application/zip" });
      expect(await detectAppGeneratedCartridge(blob)).toBe(false);
    },
    30000
  );

  it.skipIf(!hasRealCanvasExport)(
    "parseCartridgeBlob leaves appGenerated false for the ACTUAL downloaded Canvas export (and still reads its 12 modules)",
    async () => {
      const bytes = fs.readFileSync(REAL_CANVAS_EXPORT_PATH);
      const blob = new Blob([bytes], { type: "application/zip" });
      const data = await parseCartridgeBlob(blob);
      expect(data.appGenerated ?? false).toBe(false);
      expect(data.modules.length).toBe(12);
    },
    30000
  );
});

describe("detectAppGeneratedCartridge - degrades safely on bad input", () => {
  it("returns false, does not throw, for garbage bytes that are not a zip at all", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]);
    await expect(detectAppGeneratedCartridge(blob)).resolves.toBe(false);
  });

  it("returns false, does not throw, for an empty blob", async () => {
    const blob = new Blob([]);
    await expect(detectAppGeneratedCartridge(blob)).resolves.toBe(false);
  });

  it("returns false, does not throw, for a truncated/partial zip archive", async () => {
    const original = await buildCommonCartridge("Truncated Course", [
      { week: 1, title: "Week 1", files: [], pages: [], assignments: [] },
    ]);
    const fullBytes = new Uint8Array(await original.arrayBuffer());
    const truncated = fullBytes.slice(0, Math.floor(fullBytes.length / 2));
    const blob = new Blob([truncated]);
    await expect(detectAppGeneratedCartridge(blob)).resolves.toBe(false);
  });

  it("returns false, does not throw, when a valid zip's stamp file itself is corrupted", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", "<manifest></manifest>");
    zip.file(CARTRIDGE_STAMP_PATH, "{this is not valid json");
    const bytes = await zip.generateAsync({ type: "blob" });
    await expect(detectAppGeneratedCartridge(bytes)).resolves.toBe(false);
  });

  it("parseCartridgeBlob also does not throw on a valid zip with a corrupted stamp file", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", "<manifest></manifest>");
    zip.file(CARTRIDGE_STAMP_PATH, "{this is not valid json");
    const bytes = await zip.generateAsync({ type: "blob" });
    const data = await parseCartridgeBlob(bytes);
    expect(data.appGenerated ?? false).toBe(false);
  });
});
