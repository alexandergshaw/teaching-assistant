import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isCanvasCredentialRequiredError,
  CANVAS_CREDENTIAL_CTA_HREF,
  CANVAS_CREDENTIAL_CTA_LABEL,
} from "./canvas-credential-cta";
import { CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "./canvas-credentials";

describe("isCanvasCredentialRequiredError", () => {
  it("matches the shared constant", () => {
    expect(isCanvasCredentialRequiredError(CANVAS_CREDENTIAL_REQUIRED_MESSAGE)).toBe(true);
  });

  it("does not match a different, unrelated error message", () => {
    expect(isCanvasCredentialRequiredError("Canvas base URL is not configured for MCC.")).toBe(false);
  });

  it("does not match null, undefined, or the empty string", () => {
    expect(isCanvasCredentialRequiredError(null)).toBe(false);
    expect(isCanvasCredentialRequiredError(undefined)).toBe(false);
    expect(isCanvasCredentialRequiredError("")).toBe(false);
  });

  it("is exact - no case-insensitive or substring match", () => {
    expect(isCanvasCredentialRequiredError(CANVAS_CREDENTIAL_REQUIRED_MESSAGE.toUpperCase())).toBe(false);
    expect(isCanvasCredentialRequiredError(CANVAS_CREDENTIAL_REQUIRED_MESSAGE + " extra")).toBe(false);
    expect(isCanvasCredentialRequiredError(CANVAS_CREDENTIAL_REQUIRED_MESSAGE.slice(0, -1))).toBe(false);
  });
});

describe("CANVAS_CREDENTIAL_CTA_HREF / CANVAS_CREDENTIAL_CTA_LABEL", () => {
  it("routes to the real in-app credential page", () => {
    expect(CANVAS_CREDENTIAL_CTA_HREF).toBe("/account/integrations");
  });

  it("names the action and the location, not a benefit claim (copy rule)", () => {
    expect(CANVAS_CREDENTIAL_CTA_LABEL.toLowerCase()).not.toContain("faster");
    expect(CANVAS_CREDENTIAL_CTA_LABEL.toLowerCase()).not.toContain("speed");
    expect(CANVAS_CREDENTIAL_CTA_LABEL.length).toBeGreaterThan(0);
  });
});

// W5-1 - watched failure. Reproduced with a mocked module rather than by
// editing canvas-credentials.ts, which is not in this wave's write set and
// is live under concurrent agents. The mock stands in for "the source
// message changed"; the two cases below show a copied-literal predicate
// going RED against that change while the real, import-based predicate
// stays GREEN.
describe("W5-1: the predicate tracks the source constant by import, not by a copied literal", () => {
  const CHANGED_MESSAGE = "A different message than the one hardcoded below.";
  const COPIED_LITERAL = "Connect your Canvas account for this institution in Settings.";

  beforeEach(() => {
    vi.resetModules();
  });

  it("sanity: the copied literal matches today's real constant", () => {
    expect(COPIED_LITERAL).toBe(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  });

  it("RED: a copied-literal predicate stops matching once the source message changes", async () => {
    vi.doMock("./canvas-credentials", () => ({
      CANVAS_CREDENTIAL_REQUIRED_MESSAGE: CHANGED_MESSAGE,
    }));
    const copiedLiteralPredicate = (message: string | null | undefined) => message === COPIED_LITERAL;
    const { CANVAS_CREDENTIAL_REQUIRED_MESSAGE: changed } = await import("./canvas-credentials");
    // This is the drift a copied literal cannot see: `changed` is the
    // (mocked) current source-of-truth message, but the hand-copied
    // predicate above was written against the old text and now says no.
    expect(copiedLiteralPredicate(changed)).toBe(false);
  });

  it("GREEN: the real, import-based predicate matches the changed message immediately", async () => {
    vi.doMock("./canvas-credentials", () => ({
      CANVAS_CREDENTIAL_REQUIRED_MESSAGE: CHANGED_MESSAGE,
    }));
    const { isCanvasCredentialRequiredError: predicate } = await import("./canvas-credential-cta");
    const { CANVAS_CREDENTIAL_REQUIRED_MESSAGE: changed } = await import("./canvas-credentials");
    expect(predicate(changed)).toBe(true);
  });
});
