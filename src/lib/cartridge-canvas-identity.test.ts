import { describe, it, expect } from "vitest";
import { parseCartridgeContextXml, cartridgeCanvasUrl } from "./cartridge-canvas-identity";

// The real attached export's course_settings/context.xml, verbatim (AC A5,
// docs/import-course-export-to-intro-video-acceptance-criteria.md). This is
// the ground truth this whole module exists to parse correctly - the
// expected result below is a FROZEN LITERAL, not something computed by
// calling the implementation.
const REAL_CONTEXT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<context_info xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <course_id>10287</course_id>
  <course_name>Introduction to Cybersecurity</course_name>
  <root_account_id>10000000000001</root_account_id>
  <root_account_name>Rize Education</root_account_name>
  <root_account_uuid>4sJRMgKXc4cUAUxny30BvkTMCVf34mPH5L4rmAM9</root_account_uuid>
  <canvas_domain>canvas.rize.education</canvas_domain>
</context_info>`;

describe("parseCartridgeContextXml", () => {
  it("matches the real attached export exactly (AC A5 ground truth)", () => {
    const identity = parseCartridgeContextXml(REAL_CONTEXT_XML);
    expect(identity).toEqual({
      courseId: "10287",
      courseName: "Introduction to Cybersecurity",
      canvasDomain: "canvas.rize.education",
    });
  });

  it("does not confuse the sibling numeric root_account_id tag with course_id", () => {
    // Isolated regression for the exact confusion the brief calls out:
    // root_account_id is also a bare numeric tag sitting right next to
    // course_id in the real file. If tagText ever matched on a substring of
    // the tag name instead of anchoring on "<course_id" exactly, this would
    // pick up "10000000000001" instead of "10287".
    const identity = parseCartridgeContextXml(REAL_CONTEXT_XML);
    expect(identity.courseId).toBe("10287");
    expect(identity.courseId).not.toBe("10000000000001");
  });

  it("returns all-null fields for absent XML", () => {
    expect(parseCartridgeContextXml("")).toEqual({
      courseId: null,
      courseName: null,
      canvasDomain: null,
    });
  });

  it("returns all-null fields for empty XML", () => {
    expect(parseCartridgeContextXml("<?xml version=\"1.0\"?>")).toEqual({
      courseId: null,
      courseName: null,
      canvasDomain: null,
    });
  });

  it("returns all-null fields for a tagless cartridge (a non-Canvas export's context_info shell)", () => {
    const tagless = `<?xml version="1.0" encoding="UTF-8"?>\n<context_info xmlns="http://canvas.instructure.com/xsd/cccv1p0"></context_info>`;
    expect(parseCartridgeContextXml(tagless)).toEqual({
      courseId: null,
      courseName: null,
      canvasDomain: null,
    });
  });

  it("never throws on malformed input", () => {
    expect(() => parseCartridgeContextXml("<not-xml-at-all")).not.toThrow();
    expect(() => parseCartridgeContextXml(null as unknown as string)).not.toThrow();
    expect(() => parseCartridgeContextXml(undefined as unknown as string)).not.toThrow();
  });
});

describe("cartridgeCanvasUrl", () => {
  it("builds the full URL from the real fixture (AC A5 ground truth)", () => {
    const identity = parseCartridgeContextXml(REAL_CONTEXT_XML);
    expect(cartridgeCanvasUrl(identity)).toBe("https://canvas.rize.education/courses/10287");
  });

  it("builds the host-less form when only courseId is present", () => {
    expect(cartridgeCanvasUrl({ courseId: "10287", courseName: null, canvasDomain: null })).toBe(
      "/courses/10287"
    );
  });

  it("returns null when courseId is absent, even with a domain", () => {
    expect(
      cartridgeCanvasUrl({ courseId: null, courseName: null, canvasDomain: "canvas.rize.education" })
    ).toBeNull();
  });

  it("returns null when courseId is not all digits", () => {
    expect(
      cartridgeCanvasUrl({ courseId: "10287-draft", courseName: null, canvasDomain: "canvas.rize.education" })
    ).toBeNull();
    expect(cartridgeCanvasUrl({ courseId: "abc", courseName: null, canvasDomain: null })).toBeNull();
    expect(cartridgeCanvasUrl({ courseId: "", courseName: null, canvasDomain: null })).toBeNull();
  });

  it("round-trips through canvas-url.ts's parseCanvasCourseId - the whole reason for the digits-only guard", async () => {
    const { parseCanvasCourseId } = await import("./canvas-url");
    const identity = parseCartridgeContextXml(REAL_CONTEXT_XML);
    const url = cartridgeCanvasUrl(identity);
    expect(url).not.toBeNull();
    expect(parseCanvasCourseId(url as string)).toBe("10287");

    const hostless = cartridgeCanvasUrl({ courseId: "42", courseName: null, canvasDomain: null });
    expect(parseCanvasCourseId(hostless as string)).toBe("42");
  });
});
