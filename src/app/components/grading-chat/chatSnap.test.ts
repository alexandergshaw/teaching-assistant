// W1 single-screenshot snap (docs/grading-chat-consolidation-scope.md).
// The live getDisplayMedia capture is owner-walk; the machine-checkable seams
// are the diagnostic, the failure scrub, and the wiring into the tray.
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  readSessionDiagnosticSurfaceEntries,
  resetSessionDiagnosticLogForTests,
} from "@/lib/session-diagnostic-log";
import { GRADING_DIAGNOSTIC_OPERATION_LABELS } from "@/app/components/grading/gradingDiagnosticLog";
import { classifySnapFailure, frameToImageFile, recordSnapDiagnostic } from "./chatFrameCapture";

const DIR = join(process.cwd(), "src/app/components/grading-chat");
const capture = readFileSync(join(DIR, "chatFrameCapture.ts"), "utf8");
const composer = readFileSync(join(DIR, "ChatComposer.tsx"), "utf8");

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-11T10:00:00.000Z");
});

describe("capture_screenshot diagnostic", () => {
  it("has an operation label", () => {
    expect(GRADING_DIAGNOSTIC_OPERATION_LABELS.capture_screenshot).toBe("Capture screenshot");
  });

  it("records a success entry", () => {
    recordSnapDiagnostic(performance.now(), null);
    const { entries } = readSessionDiagnosticSurfaceEntries("grading");
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe("capture_screenshot");
    expect(entries[0].outcome).toBe("success");
  });

  it("records a failure entry with a fixed class, never the raw text", () => {
    const raw = new Error("Capture of window 'Jane Doe - Essay.docx' failed");
    const cls = classifySnapFailure(raw);
    recordSnapDiagnostic(performance.now(), cls);
    const { entries } = readSessionDiagnosticSurfaceEntries("grading");
    expect(entries[0].outcome).toBe("failure");
    expect(entries[0].error).toBe("capture failed");
    expect(JSON.stringify(entries)).not.toContain("Jane");
  });

  it("classifies a missing frame", () => {
    expect(classifySnapFailure(new Error("no frame"))).toBe("no frame");
  });
});

describe("single-snap wiring", () => {
  it("the snap output is the same image File shape Record produces", () => {
    const file = frameToImageFile("/9j/4AAQ", 1);
    expect(file.type).toBe("image/jpeg");
    expect(file.name.endsWith(".jpg")).toBe(true);
  });

  it("snapOnce is readiness-gated and delivers one file through onFrames", () => {
    expect(capture).toContain("export function useChatScreenFrameCapture");
    expect(capture).toMatch(/video\.readyState < 2[\s\S]*SNAP_READY_TIMEOUT_MS/);
    expect(capture).toContain("onFramesRef.current([frameToImageFile(base64, 1)])");
    expect(capture).toContain('operation: "capture_screenshot"');
  });

  it("the composer routes the snap through the same addParts tray as Record", () => {
    expect(composer).toContain("capture.snapOnce()");
    expect(composer).toMatch(/useChatScreenFrameCapture\(\(files\) =>\s*addParts\(/);
  });
});

describe("vertical expand wiring", () => {
  it("resize stays inline on the textarea slot; the floor is a CSS var, never inline minHeight", () => {
    expect(composer).toMatch(/htmlInput: \{[\s\S]*style: \{ resize: "vertical" \}/);
    expect(composer).not.toMatch(/htmlInput: \{[\s\S]*minHeight/);
    expect(composer).toContain('"--composer-floor": `${composerHeight}px`');
    expect(composer).toContain("persistComposerHeight(after)");
  });

  it("restores the stored floor in a mount effect, not the state initializer (hydration)", () => {
    expect(composer).toContain("useState<number | null>(null)");
    expect(composer).not.toMatch(/useState<number \| null>\(\(\) => loadComposerHeight/);
    expect(composer).toMatch(/useEffect\(\(\) => \{[\s\S]*await Promise\.resolve\(loadComposerHeight\(\)\)[\s\S]*setComposerHeight\(stored\)/);
  });

  it("the CSS floor reaches only the real textarea, not the aria-hidden measurer", () => {
    const css = readFileSync(join(DIR, "grading-chat.module.css"), "utf8");
    expect(css).toMatch(/\.composerGrow textarea:not\(\[aria-hidden="true"\]\) \{\s*min-height: min\(var\(--composer-floor, 0px\), 25vh\);/);
  });
});
