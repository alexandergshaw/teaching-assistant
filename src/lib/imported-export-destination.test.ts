import { describe, it, expect } from "vitest";
import { chooseImportDestination, resolveImportFallbackName } from "./imported-export-destination";
import type { CartridgeCanvasIdentity } from "./cartridge-canvas-identity";

function identity(overrides: Partial<CartridgeCanvasIdentity> = {}): CartridgeCanvasIdentity {
  return { courseId: null, courseName: null, canvasDomain: null, ...overrides };
}

describe("resolveImportFallbackName", () => {
  it("uses the cartridge title when present", () => {
    expect(resolveImportFallbackName("Introduction to Cybersecurity", "export.imscc")).toBe(
      "Introduction to Cybersecurity"
    );
  });

  it("trims a title with surrounding whitespace", () => {
    expect(resolveImportFallbackName("  My Course  ", "export.imscc")).toBe("My Course");
  });

  it("falls back to the file name, extension stripped, when the title is blank", () => {
    expect(resolveImportFallbackName("", "introduction-to-cybersecurity-export.imscc")).toBe(
      "introduction-to-cybersecurity-export"
    );
  });

  it("falls back to the file name when the title is whitespace-only", () => {
    expect(resolveImportFallbackName("   ", "export.zip")).toBe("export");
  });

  it("falls back to the file name when the title is null", () => {
    expect(resolveImportFallbackName(null, "export.zip")).toBe("export");
  });

  it("falls back to the file name when the title is undefined", () => {
    expect(resolveImportFallbackName(undefined, "export.zip")).toBe("export");
  });

  it("strips only the last extension", () => {
    expect(resolveImportFallbackName(null, "backup.tar.gz")).toBe("backup.tar");
  });

  it("strips a directory component defensively even though File.name never carries one", () => {
    expect(resolveImportFallbackName(null, "some/path/export.imscc")).toBe("export");
  });

  it("leaves a leading-dot file name with no other dot alone (dotfile, not an extension to strip)", () => {
    expect(resolveImportFallbackName(null, ".imscc")).toBe(".imscc");
  });

  it("leaves a file name with no extension alone", () => {
    expect(resolveImportFallbackName(null, "export")).toBe("export");
  });
});

describe("chooseImportDestination", () => {
  const rowA = { id: "row-a", name: "Course A", canvasUrl: "https://canvas.rize.education/courses/10287" };
  const rowB = { id: "row-b", name: "Course B", canvasUrl: "/courses/999" };
  const rowNoUrl = { id: "row-c", name: "Course C", canvasUrl: null };

  it("returns existing when exactly one saved row's canvasUrl parses to the cartridge's numeric course id", () => {
    const result = chooseImportDestination([rowA, rowB, rowNoUrl], identity({ courseId: "10287" }), "fallback");
    // stampCanvasUrl is null on an (a)-match: the row's canvasUrl already
    // parses to the cartridge's id, so there is nothing to write.
    expect(result).toEqual({ kind: "existing", courseId: "row-a", stampCanvasUrl: null });
  });

  it("returns create when zero rows match the cartridge's course id", () => {
    const result = chooseImportDestination([rowA, rowB], identity({ courseId: "55555" }), "New Course");
    expect(result).toEqual({ kind: "create", name: "New Course", canvasUrl: "/courses/55555" });
  });

  it("returns create, never a guess, when two or more rows match the same course id", () => {
    const dupe = { id: "row-a2", name: "Course A duplicate", canvasUrl: "https://other.instructure.com/courses/10287" };
    const result = chooseImportDestination([rowA, dupe], identity({ courseId: "10287" }), "New Course");
    expect(result.kind).toBe("create");
  });

  it("returns create when the cartridge course id is non-numeric", () => {
    const result = chooseImportDestination([rowA], identity({ courseId: "abc123" }), "New Course");
    expect(result).toEqual({ kind: "create", name: "New Course", canvasUrl: null });
  });

  it("returns create when the cartridge course id is blank", () => {
    const result = chooseImportDestination([rowA], identity({ courseId: "" }), "New Course");
    expect(result.kind).toBe("create");
  });

  it("returns create with a null canvasUrl when identity is absent entirely", () => {
    const result = chooseImportDestination([rowA], undefined, "New Course");
    expect(result).toEqual({ kind: "create", name: "New Course", canvasUrl: null });
  });

  it("returns create with a null canvasUrl when identity has no course id at all", () => {
    const result = chooseImportDestination([rowA], identity(), "New Course");
    expect(result).toEqual({ kind: "create", name: "New Course", canvasUrl: null });
  });

  it("composes the full https URL on create when both courseId and canvasDomain are present", () => {
    const result = chooseImportDestination([], identity({ courseId: "42", canvasDomain: "school.instructure.com" }), "N");
    expect(result).toEqual({ kind: "create", name: "N", canvasUrl: "https://school.instructure.com/courses/42" });
  });

  it("composes a host-less URL on create when only courseId is present", () => {
    const result = chooseImportDestination([], identity({ courseId: "42" }), "N");
    expect(result).toEqual({ kind: "create", name: "N", canvasUrl: "/courses/42" });
  });

  it("never matches a row with a null canvasUrl", () => {
    const result = chooseImportDestination([rowNoUrl], identity({ courseId: "10287" }), "N");
    expect(result.kind).toBe("create");
  });

  it("never matches a row whose canvasUrl parses to a different course id", () => {
    const result = chooseImportDestination([rowB], identity({ courseId: "10287" }), "N");
    expect(result.kind).toBe("create");
  });
});

describe("chooseImportDestination - match order (b), existing by name (defect fix)", () => {
  it("attaches to a name match with a blank (null) canvasUrl and stamps the cartridge's URL", () => {
    const rowX = { id: "row-x", name: "Introduction to Cybersecurity", canvasUrl: null };
    // courseId is present (so cartridgeCanvasUrl can compose a URL to stamp)
    // but matches ZERO rows at (a), so this exercises (b) on its own.
    const result = chooseImportDestination(
      [rowX],
      identity({ courseId: "10287", courseName: "Introduction to Cybersecurity", canvasDomain: "canvas.rize.education" }),
      "fallback"
    );
    expect(result).toEqual({
      kind: "existing",
      courseId: "row-x",
      stampCanvasUrl: "https://canvas.rize.education/courses/10287",
    });
  });

  it("attaches to a name match with a whitespace-only canvasUrl and stamps", () => {
    const rowX = { id: "row-x", name: "Introduction to Cybersecurity", canvasUrl: "   " };
    const result = chooseImportDestination(
      [rowX],
      identity({ courseId: "10287", courseName: "Introduction to Cybersecurity", canvasDomain: "canvas.rize.education" }),
      "fallback"
    );
    expect(result).toEqual({
      kind: "existing",
      courseId: "row-x",
      stampCanvasUrl: "https://canvas.rize.education/courses/10287",
    });
  });

  it("does not attach when the name-matching row already carries a DIFFERENT canvasUrl - creates instead", () => {
    const rowX = { id: "row-x", name: "Introduction to Cybersecurity", canvasUrl: "https://canvas.rize.education/courses/999" };
    const result = chooseImportDestination(
      [rowX],
      identity({ courseId: "10287", courseName: "Introduction to Cybersecurity", canvasDomain: "canvas.rize.education" }),
      "New Course"
    );
    expect(result).toEqual({
      kind: "create",
      name: "New Course",
      canvasUrl: "https://canvas.rize.education/courses/10287",
    });
  });

  it("returns create, never a guess, when two rows share the same name with blank canvasUrls", () => {
    const rowX = { id: "row-x", name: "Introduction to Cybersecurity", canvasUrl: null };
    const rowY = { id: "row-y", name: "Introduction to Cybersecurity", canvasUrl: "" };
    const result = chooseImportDestination(
      [rowX, rowY],
      identity({ courseName: "Introduction to Cybersecurity" }),
      "New Course"
    );
    expect(result.kind).toBe("create");
  });

  it("matches a name that differs only in case and surrounding whitespace", () => {
    const rowX = { id: "row-x", name: "  Introduction TO Cybersecurity  ", canvasUrl: null };
    const result = chooseImportDestination(
      [rowX],
      identity({ courseName: "introduction to cybersecurity" }),
      "fallback"
    );
    // No courseId on the cartridge, so cartridgeCanvasUrl has nothing to
    // compose - stampCanvasUrl is null even though the row itself matched.
    expect(result).toEqual({ kind: "existing", courseId: "row-x", stampCanvasUrl: null });
  });

  it("falls to create when the cartridge reports no courseName at all", () => {
    const rowX = { id: "row-x", name: "Introduction to Cybersecurity", canvasUrl: null };
    const result = chooseImportDestination([rowX], identity({ courseName: null }), "New Course");
    expect(result).toEqual({ kind: "create", name: "New Course", canvasUrl: null });
  });

  it("falls to create when the cartridge's courseName is blank/whitespace-only", () => {
    const rowX = { id: "row-x", name: "Introduction to Cybersecurity", canvasUrl: null };
    const result = chooseImportDestination([rowX], identity({ courseName: "   " }), "New Course");
    expect(result.kind).toBe("create");
  });

  it("prefers a unique canvasUrl match (a) over a competing name match (b)", () => {
    const rowA2 = { id: "row-a2", name: "Some Other Name", canvasUrl: "https://canvas.rize.education/courses/10287" };
    const rowNameMatch = { id: "row-name", name: "Introduction to Cybersecurity", canvasUrl: null };
    const result = chooseImportDestination(
      [rowA2, rowNameMatch],
      identity({ courseId: "10287", courseName: "Introduction to Cybersecurity", canvasDomain: "canvas.rize.education" }),
      "fallback"
    );
    // (a) wins outright: row-a2, and stampCanvasUrl is null (an (a)-match
    // never stamps), never row-name even though its name also matches.
    expect(result).toEqual({ kind: "existing", courseId: "row-a2", stampCanvasUrl: null });
  });
});
