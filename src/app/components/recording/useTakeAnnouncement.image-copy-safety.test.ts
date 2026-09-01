import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// The owner separately requires the announcement be PLAIN TEXT COPYABLE
// (docs reference: the recording tab's own standing requirement) - the
// generated image must never be embedded into `subject`/`body`, and copying
// or saving the announcement must yield the exact same plain text whether or
// not an image was ever generated, is currently loading, failed, or was
// explicitly discarded. vitest here is node-env and renders no component
// (see this repo's own vitest config - only src/**/*.test.ts is collected,
// never .test.tsx), so this is proven the same way
// recording-split.structure.test.ts proves its own cross-component
// contracts: a structural source-text check, not a rendered assertion.
//
// What this actually proves: every call site in useTakeAnnouncement.ts that
// writes `subject`/`body` (setSubject/setBody) or that builds the
// MessageDraftPayload saveDraft() hands to saveMessageDraftAction never
// references anything image-related. It cannot prove image state could
// NEVER leak into those strings by some other, differently-shaped code path
// added later - see the "sabotage" tests below for the one failure mode this
// specifically guards: someone concatenating image data (or even just the
// word "image") into the subject/body write, or into the saved draft
// payload, without touching any of the other announcement tests (which never
// look at imageBase64/imageMimeType at all).
describe("announcement image never reaches the copyable subject/body text", () => {
  const hookSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/components/recording/useTakeAnnouncement.ts"),
    "utf-8"
  );

  it("finds at least one setSubject and one setBody call - a check over nothing proves nothing", () => {
    expect(hookSource).toMatch(/setSubject\(/);
    expect(hookSource).toMatch(/setBody\(/);
  });

  it("every setSubject(...) / setBody(...) call site is free of any image reference", () => {
    const calls = hookSource.match(/set(?:Subject|Body)\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.toLowerCase(), `expected no "image" reference in: ${call}`).not.toMatch(/image/);
    }
  });

  it("the MessageDraftPayload built for saveDraft is free of any image reference", () => {
    const payloadMatch = hookSource.match(/const payload: MessageDraftPayload = \{[\s\S]*?\};/);
    expect(payloadMatch, "expected to find the MessageDraftPayload object literal in useTakeAnnouncement.ts").not.toBeNull();
    expect(payloadMatch![0].toLowerCase()).not.toMatch(/image/);
  });

  it("sabotage check: the setSubject/setBody scan actually catches an image reference if one is added", () => {
    const sabotaged = 'setBody(body + (imageBase64 ?? ""));';
    const calls = sabotaged.match(/set(?:Subject|Body)\([^)]*\)/g) ?? [];
    expect(calls.length).toBe(1);
    expect(calls.some((call) => call.toLowerCase().includes("image"))).toBe(true);
  });

  it("sabotage check: the payload scan actually catches an image field if one is added", () => {
    const sabotaged = `const payload: MessageDraftPayload = {
        kind: "announcement",
        title: subject,
        body,
        imageBase64,
      };`;
    const payloadMatch = sabotaged.match(/const payload: MessageDraftPayload = \{[\s\S]*?\};/);
    expect(payloadMatch).not.toBeNull();
    expect(payloadMatch![0].toLowerCase()).toMatch(/image/);
  });
});
