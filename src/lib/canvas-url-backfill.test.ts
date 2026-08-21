import { describe, expect, it } from "vitest";
import { planCanvasUrlBackfill } from "./canvas-url-backfill";
import type { CartridgeCanvasIdentity } from "./cartridge-canvas-identity";

function identity(overrides: Partial<CartridgeCanvasIdentity> = {}): CartridgeCanvasIdentity {
  return { courseId: "10287", courseName: "Introduction to Cybersecurity", canvasDomain: null, ...overrides };
}

describe("planCanvasUrlBackfill", () => {
  it("happy path: blank target URL, unique id -> stamps the identity's URL", () => {
    const courses = [{ id: "c1", canvasUrl: null }];
    const result = planCanvasUrlBackfill(courses, "c1", identity());
    expect(result).toBe("/courses/10287");
  });

  it("target already has a URL -> null, never overwrites a stored value", () => {
    const courses = [{ id: "c1", canvasUrl: "https://school.instructure.com/courses/999" }];
    const result = planCanvasUrlBackfill(courses, "c1", identity());
    expect(result).toBeNull();
  });

  it("another row already carries the SAME id -> null (the load-bearing refusal)", () => {
    const courses = [
      { id: "c1", canvasUrl: null },
      { id: "c2", canvasUrl: "/courses/10287" },
    ];
    const result = planCanvasUrlBackfill(courses, "c1", identity());
    expect(result).toBeNull();
  });

  it("another row carries a DIFFERENT id -> still stamps", () => {
    const courses = [
      { id: "c1", canvasUrl: null },
      { id: "c2", canvasUrl: "/courses/55555" },
    ];
    const result = planCanvasUrlBackfill(courses, "c1", identity());
    expect(result).toBe("/courses/10287");
  });

  it("identity undefined -> null", () => {
    const courses = [{ id: "c1", canvasUrl: null }];
    const result = planCanvasUrlBackfill(courses, "c1", undefined);
    expect(result).toBeNull();
  });

  it("non-numeric course id -> null", () => {
    const courses = [{ id: "c1", canvasUrl: null }];
    const result = planCanvasUrlBackfill(courses, "c1", identity({ courseId: "abc123" }));
    expect(result).toBeNull();
  });

  it("target id absent from the list -> null", () => {
    const courses = [{ id: "other", canvasUrl: null }];
    const result = planCanvasUrlBackfill(courses, "c1", identity());
    expect(result).toBeNull();
  });

  it("detects a colliding id whether the OTHER row stores a host-less or a full-URL form", () => {
    const hostless = [
      { id: "c1", canvasUrl: null },
      { id: "c2", canvasUrl: "/courses/10287" },
    ];
    expect(planCanvasUrlBackfill(hostless, "c1", identity())).toBeNull();

    const fullUrl = [
      { id: "c1", canvasUrl: null },
      { id: "c2", canvasUrl: "https://canvas.rize.education/courses/10287" },
    ];
    expect(planCanvasUrlBackfill(fullUrl, "c1", identity())).toBeNull();
  });

  it("builds the full https URL when the identity carries a canvasDomain", () => {
    const courses = [{ id: "c1", canvasUrl: null }];
    const result = planCanvasUrlBackfill(courses, "c1", identity({ canvasDomain: "canvas.rize.education" }));
    expect(result).toBe("https://canvas.rize.education/courses/10287");
  });

  it("a whitespace-only target canvasUrl is treated as blank, not as a stored value", () => {
    const courses = [{ id: "c1", canvasUrl: "   " }];
    const result = planCanvasUrlBackfill(courses, "c1", identity());
    expect(result).toBe("/courses/10287");
  });

  it("a whitespace-only OTHER row canvasUrl never collides (blank, not a real id)", () => {
    const courses = [
      { id: "c1", canvasUrl: null },
      { id: "c2", canvasUrl: "   " },
    ];
    const result = planCanvasUrlBackfill(courses, "c1", identity());
    expect(result).toBe("/courses/10287");
  });
});
