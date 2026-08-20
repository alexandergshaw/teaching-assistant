// Teleprompter mode wiring - source-text tests (docs/teleprompter-mode-
// acceptance-criteria.md, chunk 3f). vitest here is node-env and collects
// only src/**/*.test.ts - nothing in this feature can be rendered (that
// doc's own "Limits" section), so this file reads the three new/edited
// files as TEXT and pins the structural facts the acceptance criteria are
// actually about, following the same readFileSync + regex idiom
// generatedPreviewModal.wiring.test.ts already uses.
//
// Every check below pins a FACT ("this call happens", "this literal never
// appears"), never a spelling - source-text tests that pin prose have twice
// forced contorted rewrites in this repo (see that doc's own entry on the
// subject), so comments are stripped before any "must not contain" assertion
// runs, and no assertion below cares how a message is worded.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MODAL_PATH = join(process.cwd(), "src/app/components/content-tab/modules/GeneratedPreviewModal.tsx");
const PANEL_PATH = join(process.cwd(), "src/app/components/content-tab/modules/TeleprompterPanel.tsx");
const SESSION_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useTeleprompterSession.ts");

/** Source with comments stripped, so prose discussing a pattern (e.g. this
 * very file's own header comment, or GeneratedPreviewModal.tsx's own import
 * comment explaining what T1 forbids) is never mistaken for the pattern
 * itself. Mirrors generatedPreviewModal.wiring.test.ts's own stripComments. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const modalSource = readFileSync(MODAL_PATH, "utf8");
const modalStripped = stripComments(modalSource);
const panelSource = readFileSync(PANEL_PATH, "utf8");
const sessionSource = readFileSync(SESSION_PATH, "utf8");

describe("stripComments (canary first)", () => {
  it("removes a // comment but leaves real code alone", () => {
    const fixture = ['// preview.kindId === "scripts" is what this forbids', 'const x = kindDeliveredAloud(preview.kindId);'].join("\n");
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain('kindId === "scripts"');
    expect(stripped).toContain("kindDeliveredAloud(preview.kindId)");
  });
});

describe("T1 - the teleprompter entry point is gated on kindDeliveredAloud, never a literal kind id", () => {
  it("imports kindDeliveredAloud from the kinds registry", () => {
    expect(modalSource).toMatch(/import\s*\{\s*kindDeliveredAloud\s*\}\s*from\s*["']@\/lib\/lms-generation\/kinds["']/);
  });

  it("gates entry on kindDeliveredAloud(preview.kindId)", () => {
    expect(modalStripped).toContain("kindDeliveredAloud(preview.kindId)");
  });

  it("never hardcodes a scripts-kind-id comparison anywhere in the call site", () => {
    // Comments stripped first (see the canary above) - this file's own
    // header comment on the kindDeliveredAloud import explains what NOT to
    // do using this exact string, which would otherwise self-fail.
    expect(modalStripped).not.toMatch(/kindId\s*===\s*["']scripts["']/);
  });
});

describe("T7 - the panel mounts the canvas ref from useCameraPreview (via useTeleprompterSession)", () => {
  it("useTeleprompterSession imports useCameraPreview and forwards its canvasRef", () => {
    expect(sessionSource).toMatch(/import\s*\{\s*useCameraPreview/);
    expect(sessionSource).toContain("canvasRef: camera.canvasRef");
  });

  it("TeleprompterPanel destructures canvasRef from useTeleprompterSession and binds it to a <canvas>", () => {
    expect(panelSource).toMatch(/const\s*\{[^}]*\bcanvasRef\b[^}]*\}\s*=\s*useTeleprompterSession\(/);
    expect(panelSource).toMatch(/<canvas\s+ref=\{canvasRef\}/);
  });
});

describe("T3 - leaving tears down every stream, reachable by an explicit control and by Escape", () => {
  it("exitTeleprompter calls the preview hook's own stop()", () => {
    const match = sessionSource.match(/const\s+exitTeleprompter\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[/);
    expect(match, "exitTeleprompter should be defined as a useCallback").not.toBeNull();
    const body = match![1];
    expect(body, "exitTeleprompter should stop the camera preview").toContain("camera.stop()");
    expect(body, "exitTeleprompter should also stop live transcription").toContain("transcription.stop()");
  });

  it("the panel's explicit exit control calls exitTeleprompter before telling the caller to unmount", () => {
    const match = panelSource.match(/const\s+handleExit\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\};/);
    expect(match, "a handleExit handler should exist").not.toBeNull();
    const body = match![1];
    const exitIdx = body.indexOf("exitTeleprompter()");
    const onExitIdx = body.indexOf("onExit()");
    expect(exitIdx, "handleExit should call exitTeleprompter()").toBeGreaterThanOrEqual(0);
    expect(onExitIdx, "handleExit should call onExit()").toBeGreaterThanOrEqual(0);
    expect(exitIdx, "exitTeleprompter() must run BEFORE onExit() - streams torn down before unmount").toBeLessThan(onExitIdx);
    expect(panelSource).toMatch(/onClick=\{handleExit\}/);
  });

  it("Escape (routed through the modal's handleDismiss) exits teleprompter mode FIRST, never straight to closing the modal", () => {
    const match = modalStripped.match(/const\s+handleDismiss\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n {2}\};/);
    expect(match, "a handleDismiss handler should exist").not.toBeNull();
    const body = match![1];
    const teleprompterCheckIdx = body.indexOf("teleprompterOpen");
    const closePreviewIdx = body.indexOf("onClosePreview()");
    expect(teleprompterCheckIdx, "handleDismiss should check teleprompterOpen").toBeGreaterThanOrEqual(0);
    expect(closePreviewIdx, "handleDismiss should still be able to close the modal").toBeGreaterThanOrEqual(0);
    expect(
      teleprompterCheckIdx,
      "the teleprompterOpen check must come BEFORE the modal-closing branch, so Escape exits teleprompter mode rather than the whole modal"
    ).toBeLessThan(closePreviewIdx);
    expect(body).toContain("setTeleprompterOpen(false)");
  });
});

describe("T2 - nothing is captured anywhere in this feature", () => {
  // Comments stripped first (see the canary above) - both new files' own
  // header comments name "MediaRecorder"/"captureStream" while explaining
  // that T2 forbids them, which would otherwise self-fail every check here.
  const files: Array<[string, string]> = [
    ["GeneratedPreviewModal.tsx", modalStripped],
    ["TeleprompterPanel.tsx", stripComments(panelSource)],
    ["useTeleprompterSession.ts", stripComments(sessionSource)],
  ];

  for (const [name, source] of files) {
    it(`${name} never references MediaRecorder`, () => {
      expect(source).not.toContain("MediaRecorder");
    });
    it(`${name} never calls captureStream`, () => {
      expect(source).not.toContain("captureStream");
    });
  }
});

describe("T11 - filler feedback is gated on the Web Speech path being ACTIVE, not merely supported", () => {
  it("fillerAvailability is called with activePath === \"web-speech\"", () => {
    expect(sessionSource).toMatch(/fillerAvailability\([^)]*activePath\s*===\s*["']web-speech["']/);
  });
});

describe("X2/T12 - the panel imports fmt rather than formatting elapsed time itself", () => {
  it("imports fmt from the recording tab's tested formatter", () => {
    expect(panelSource).toMatch(/import\s*\{\s*fmt\s*\}\s*from\s*["']\.\.\/\.\.\/recording\/types["']/);
  });

  it("never re-implements fmt's own padStart(2, \"0\") shape", () => {
    expect(panelSource).not.toMatch(/padStart\(2,\s*["']0["']\)/);
  });

  it("useTeleprompterSession.ts also never re-implements a time formatter", () => {
    expect(sessionSource).not.toMatch(/padStart\(2,\s*["']0["']\)/);
  });
});

describe("X3 - the script text is only displayed, never sent anywhere new", () => {
  it("TeleprompterPanel renders `script` as plain text and never posts, narrates or synthesizes it", () => {
    // Comments stripped first (see the canary above) - this file's own
    // header comment names "TTS"/"avatar" while explaining what X3 forbids,
    // which would otherwise self-fail this exact assertion.
    const stripped = stripComments(panelSource);
    expect(stripped).not.toMatch(/\btts\b/i);
    expect(stripped).not.toContain("Avatar");
    expect(stripped).not.toMatch(/createPageAction|createAnnouncementAction|createModuleItemAction/);
  });
});

describe("X1 - no portal, rendered inside the modal that already owns root-level stacking", () => {
  it("TeleprompterPanel introduces no portal", () => {
    expect(panelSource).not.toContain("createPortal");
  });

  it("GeneratedPreviewModal mounts TeleprompterPanel inside its own ModalShell body, not a sibling overlay", () => {
    const modalShellIdx = modalStripped.indexOf("<ModalShell");
    const panelIdx = modalStripped.indexOf("<TeleprompterPanel");
    expect(modalShellIdx).toBeGreaterThanOrEqual(0);
    expect(panelIdx).toBeGreaterThan(modalShellIdx);
  });
});

describe("PERSISTENCE - camera/mic/speaker/scroll-speed selections are ta- prefixed and read-on-init / write-on-change", () => {
  it("declares ta- prefixed keys for camera, mic, speaker and scroll speed", () => {
    expect(sessionSource).toMatch(/CAMERA_KEY\s*=\s*["']ta-teleprompter-camera["']/);
    expect(sessionSource).toMatch(/MIC_KEY\s*=\s*["']ta-teleprompter-mic["']/);
    expect(sessionSource).toMatch(/SPEAKER_KEY\s*=\s*["']ta-teleprompter-speaker["']/);
    expect(sessionSource).toMatch(/SCROLL_KEY\s*=\s*["']ta-teleprompter-scroll-speed["']/);
  });

  it("resolves the stored scroll speed and speaker id through the provided resolvers", () => {
    expect(sessionSource).toMatch(/resolveScrollSpeed\(/);
    expect(sessionSource).toMatch(/resolveSinkId\(/);
  });

  it("writes each persisted value back to storage on change (not only reading it once)", () => {
    expect(sessionSource).toMatch(/writeStored\(CAMERA_KEY,\s*cameraId\)/);
    expect(sessionSource).toMatch(/writeStored\(MIC_KEY,\s*micId\)/);
    expect(sessionSource).toMatch(/writeStored\(SPEAKER_KEY,\s*speakerIdRaw\)/);
    expect(sessionSource).toMatch(/writeStored\(SCROLL_KEY,\s*String\(scrollSpeed\)\)/);
  });
});

describe("T6 - the audio-output control is absent with a reason when unsupported, never an inert select", () => {
  it("the panel renders the speaker select only when sinkSupported is true, else a reason", () => {
    expect(panelSource).toMatch(/\{sinkSupported\s*\?/);
    expect(panelSource).toMatch(/audioOutputResult\?\.reason/);
  });
});

describe("T10 - insufficient pace data and unavailable filler detection are rendered explicitly, never a bare zero", () => {
  it("the panel checks paceReading.status for the insufficient-data case", () => {
    expect(panelSource).toMatch(/paceReading\.status\s*===\s*["']insufficient-data["']/);
  });

  it("the panel checks fillers.available before showing a count", () => {
    expect(panelSource).toMatch(/fillers\.available\s*\?/);
  });
});
