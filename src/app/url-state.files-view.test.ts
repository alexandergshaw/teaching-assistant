import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  normalizeFilesView,
  parseFilesView,
  buildUrlSearch,
  parseUrlState,
  resolveFilesViewFromUrl,
  type UrlNavState,
} from "./url-state";

const filesTab = readFileSync("src/app/components/FilesTab.tsx", "utf8");

const baseState: UrlNavState = {
  tab: "files",
  coursesSection: "courses",
  toolsSection: "manual",
  librarySection: "files",
  manualView: "course-planning",
  automateView: "templates",
  buildView: "prebuilt",
  contentView: "modules",
  gradingView: "chat",
  presentationsView: "slide-deck",
  announcementsView: "post",
  tasksView: "term",
  kbInstitution: null,
  kbPageId: null,
};

describe("Files view deep links", () => {
  it("normalizes supported view values and defaults invalid values to Library", () => {
    expect(normalizeFilesView("library")).toBe("library");
    expect(normalizeFilesView("submissions")).toBe("submissions");
    expect(normalizeFilesView("other")).toBe("library");
    expect(parseFilesView("?tab=files&filesView=submissions")).toBe("submissions");
  });

  it("round trips the Files view without changing existing URL state", () => {
    const href = buildUrlSearch({ ...baseState, filesView: "submissions" });
    expect(href).toBe("?tab=files&filesView=submissions");
    const parsed = parseUrlState(href);
    expect(parsed.tab).toBe("files");
    expect(parsed.filesView).toBe("submissions");
    expect(buildUrlSearch(parsed)).toBe(href);
    expect(parseFilesView(href)).toBe("submissions");
    expect(buildUrlSearch({ ...baseState, filesView: "library" })).toBe("?tab=files");
  });

  it("uses an explicit Files URL view before the persisted view", () => {
    expect(resolveFilesViewFromUrl("?tab=files&filesView=submissions", "library")).toBe("submissions");
    expect(resolveFilesViewFromUrl("?tab=files", "submissions")).toBe("library");
    expect(resolveFilesViewFromUrl("?tab=files&librarySection=knowledge&filesView=submissions", "library")).toBe("library");
    expect(resolveFilesViewFromUrl("", "submissions")).toBe("submissions");
  });

  it("renders both Files selectors as href-bearing anchors with guarded plain clicks", () => {
    expect(filesTab).toMatch(/const filesViewHref[\s\S]*?"\/"\s*\+\s*buildUrlSearch\(/);
    expect(filesTab).toContain("isPlainLeftClick(event)");
    expect(filesTab).toContain('role="tab"');
    expect(filesTab).toContain('href={filesViewHref("library")}');
    expect(filesTab).toContain('href={filesViewHref("submissions")}');
    expect(filesTab).toContain("event.preventDefault()");
    expect(filesTab).toContain("dispatchEvent");
  });
});
