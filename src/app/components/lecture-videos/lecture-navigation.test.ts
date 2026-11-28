import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusLectureSection, lectureSectionScrollMargin } from "./lectureControls";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

afterEach(() => vi.unstubAllGlobals());

describe("lecture workspace shortcuts", () => {
  it("places recording controls and the selected part before optional disclosures", () => {
    const workspace = source("./LectureVideos.tsx");
    const upload = workspace.indexOf('label="Add recordings"');
    const selected = workspace.indexOf("<LecturePartEditor");
    const context = workspace.indexOf("Video context and voice (optional)");
    expect(upload).toBeGreaterThan(-1);
    expect(selected).toBeGreaterThan(upload);
    expect(context).toBeGreaterThan(selected);
    expect(workspace.indexOf("Student announcement (optional)")).toBeGreaterThan(context);
    expect(workspace).toContain("watchUrl: event.target.value");
    expect(source("./LecturePartEditor.tsx")).not.toContain("watchUrl");
  });

  it("targets a focusable section and accounts for the sticky app header", () => {
    const focus = vi.fn();
    const scrollIntoView = vi.fn();
    const getElementById = vi.fn(() => ({ focus, scrollIntoView }));
    vi.stubGlobal("document", { getElementById });
    focusLectureSection("lecture-captions");
    expect(getElementById).toHaveBeenCalledWith("lecture-captions");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(lectureSectionScrollMargin).toContain("var(--topbar-height");
    expect(lectureSectionScrollMargin).toContain("var(--in-session-banner-height");
    expect(source("./lectureControls.tsx")).toContain("tabIndex={id ? -1 : undefined}");
  });

  it("retains the three persisted audio choices and uses direct download controls", () => {
    const editor = source("./LecturePartEditor.tsx");
    expect(editor).toContain("<RadioGroup");
    expect(editor.match(/<FormControlLabel value="(source|cues|take)"/g)).toHaveLength(3);
    expect(editor).toContain("previous.audioMode === mode ? previous : { ...previous, audioMode: mode, output: undefined }");
    expect(editor.indexOf('id="lecture-export"')).toBeLessThan(editor.indexOf("<LectureCaptions"));
    expect(editor).toContain('label="Download narrated video"');
    expect(source("./LectureCaptions.tsx")).toContain('label="Download captioned narrated video"');
    expect(source("./LectureSlideDeckOutput.tsx")).toContain('label="Download PowerPoint"');
    expect(source("./LectureDownloads.tsx")).toContain("download={file.fileName}");
  });
});
