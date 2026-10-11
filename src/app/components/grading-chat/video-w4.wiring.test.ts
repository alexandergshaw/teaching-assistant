// VIDEO-GRADING W4, T13 reachability pin (source text, because no component is
// ever rendered here): the chain composer -> decideVideoTransport -> upload ->
// storaged-video -> prepareVideo -> videoRef entry -> grade POST -> the typed
// videoFailure is WIRED, and the capability ships ENABLED. Pins facts and
// ordering, never spelling.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const panel = read("src/app/components/grading-chat/GradingChatPanel.tsx");
const client = read("src/app/components/grading-chat/videoClient.ts");
const driver = read("src/app/components/grading-chat/useContinuousGradingRun.ts");
const intake = read("src/app/components/grading-chat/chatSubmissionIntake.ts");
const constants = read("src/lib/grade/constants.ts");

describe("video composer -> driver -> grade seam wiring", () => {
  it("the panel consults the video path BEFORE the zip transport and the body preflight", () => {
    const at = panel.indexOf("submitLooseVideo(");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(panel.indexOf("chooseZipTransport(file)"));
    expect(at).toBeLessThan(panel.indexOf("preflightUploadFile(file"));
  });

  it("the panel hands the loose path the real upload gate inputs (enabled flag, pending count, signed-in user)", () => {
    expect(panel).toContain("pendingVideoCount()");
    expect(panel).toContain("VIDEO_GRADING_ENABLED");
    expect(panel).toContain("user?.id");
  });

  it("the loose path decides, uploads, then submits a storaged-video (and has callers for each)", () => {
    const decide = client.indexOf("decideVideoTransport(");
    const upload = client.indexOf("?? uploadGradingVideo");
    const submit = client.indexOf('kind: "storaged-video"');
    expect(decide).toBeGreaterThan(0);
    expect(upload).toBeGreaterThan(decide);
    expect(submit).toBeGreaterThan(upload);
  });

  it("the input union has the storaged-video member and the driver consumes it via prepareVideo", () => {
    expect(intake).toContain('"storaged-video"');
    expect(driver).toContain('input.kind === "storaged-video"');
    expect(driver).toContain("prepareVideo(");
    expect(driver).toContain("postPrepareVideo");
  });

  it("the default prepare posts to the prepare route", () => {
    expect(client).toContain("/api/grade-submission-video");
  });

  it("the grade POST turns a typed videoFailure into a typed error and the pump records it", () => {
    expect(driver).toContain("gradeFailureFromBody(body)");
    expect(driver).toContain("videoFailureOf(err)");
    expect(driver).toContain("recordVideoSettled(");
  });

  it("the in-zip ledger's video counts are recorded on the live zip path", () => {
    expect(driver).toContain("recordZipVideoOutcomes(");
  });

  it("no client file builds a signed URL for a video path", () => {
    expect(client).not.toContain("createSignedUrl");
    expect(panel).not.toContain("createSignedUrl");
  });
});

describe("video grading ships ENABLED", () => {
  it("VIDEO_GRADING_ENABLED is true (owner ruling: built enabled, not dark)", () => {
    expect(constants).toMatch(/export const VIDEO_GRADING_ENABLED = true;/);
  });
});
