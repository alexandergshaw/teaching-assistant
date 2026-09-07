import { describe, it, expect } from "vitest";

import { CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "@/lib/canvas-credentials";
import {
  classifyLmsFailure,
  describeLmsConnection,
  isOfflineConnection,
  LIVE_LMS_CONNECTION,
  lmsCourseNotLinked,
} from "./connection";
import type { LmsConnection, LmsUnavailableReason } from "./types";

// D20a: there are FOUR "no LMS" states and they already fail differently.
// THE SABOTAGE THIS FILE IS BUILT AGAINST IS COLLAPSING THEM. Every
// assertion below is written so that a `classifyLmsFailure` returning one
// constant reason, or a `describeLmsConnection` returning one constant
// sentence, goes red - which is why the distinctness checks are pairwise and
// explicit rather than a spot check on one state.
//
// The credential message is IMPORTED, never spelled. That is the same
// discipline course-picker-availability.test.ts already applies to the same
// constant: a copied literal here would keep passing after the real message
// changed, while the route it describes started reporting `unreachable` for
// every unconfigured institution.

function classify(error: unknown, scrubbedDetail = "the read failed"): LmsConnection {
  return classifyLmsFailure({
    error,
    credentialRequiredMessage: CANVAS_CREDENTIAL_REQUIRED_MESSAGE,
    scrubbedDetail,
  });
}

function reasonOf(connection: LmsConnection): LmsUnavailableReason | "live" {
  return connection.state === "live" ? "live" : connection.reason;
}

describe("classifyLmsFailure - the three unavailable states stay apart", () => {
  it("the exact credential message is no-credential", () => {
    const connection = classify(new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE));
    expect(reasonOf(connection)).toBe("no-credential");
    // The detail IS the credential message, unpicked no further: D20a's
    // indistinguishability between "no such institution", "half-configured"
    // and "you never connected" is a security property of the resolver.
    expect(connection.state === "unavailable" && connection.detail).toBe(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
  });

  it("any other error is unreachable, never no-credential", () => {
    expect(reasonOf(classify(new Error("connect ECONNREFUSED 10.0.0.1:443")))).toBe("unreachable");
    expect(reasonOf(classify(new Error("Canvas returned HTTP 503")))).toBe("unreachable");
    expect(reasonOf(classify("a thrown string"))).toBe("unreachable");
    expect(reasonOf(classify(undefined))).toBe("unreachable");
  });

  it("a message that merely CONTAINS the credential message is not no-credential", () => {
    // Identity, not substring. A substring test would let an upstream body
    // that happens to quote the message back reclassify a real outage as a
    // missing credential, and send the instructor to reconnect an account
    // that is already connected.
    expect(reasonOf(classify(new Error(`wrapped: ${CANVAS_CREDENTIAL_REQUIRED_MESSAGE} (retrying)`)))).toBe(
      "unreachable"
    );
  });

  it("carries the scrubbed detail for unreachable, and nothing when there is none", () => {
    const withDetail = classify(new Error("boom"), "Canvas returned HTTP 503");
    expect(withDetail.state === "unavailable" && withDetail.detail).toContain("Canvas returned HTTP 503");
    const withoutDetail = classify(new Error("boom"), "   ");
    expect(withoutDetail.state === "unavailable" && withoutDetail.detail).toBe("");
  });

  it("a course with no Canvas link is its own state, not a failed read", () => {
    const connection = lmsCourseNotLinked("Set an institution on the course tile.");
    expect(reasonOf(connection)).toBe("no-lms-course");
    expect(connection.state === "unavailable" && connection.detail).toBe("Set an institution on the course tile.");
  });

  it("never returns live - degrading is the whole point", () => {
    for (const thrown of [new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE), new Error("x"), null, 42]) {
      expect(classify(thrown).state).toBe("unavailable");
    }
  });

  it("the three reasons are actually three distinct values", () => {
    const reasons = [
      reasonOf(classify(new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE))),
      reasonOf(classify(new Error("network down"))),
      reasonOf(lmsCourseNotLinked("no url")),
    ];
    expect(new Set(reasons).size).toBe(3);
  });
});

describe("describeLmsConnection - the mode line says WHICH state applies", () => {
  const noCredential = classify(new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE));
  const unreachable = classify(new Error("boom"), "Canvas returned HTTP 503");
  const noCourse = lmsCourseNotLinked("Add a Canvas course URL on the course tile.");

  it("renders nothing for a live answer", () => {
    expect(describeLmsConnection(LIVE_LMS_CONNECTION)).toBe("");
    expect(isOfflineConnection(LIVE_LMS_CONNECTION)).toBe(false);
  });

  it("renders a different sentence for each unavailable state", () => {
    const lines = [
      describeLmsConnection(noCredential),
      describeLmsConnection(unreachable),
      describeLmsConnection(noCourse),
    ];
    for (const line of lines) expect(line.length).toBeGreaterThan(0);
    expect(new Set(lines).size).toBe(3);
  });

  it("each line names its own state in words an instructor can act on", () => {
    // D20e: "Canvas is not connected for this course, so this answer uses
    // only the work you recorded here" is actionable; "offline mode" is not.
    // Each phrase below is checked against the OTHER two lines as well, so a
    // single sentence covering all three states cannot satisfy this.
    const credentialLine = describeLmsConnection(noCredential);
    const unreachableLine = describeLmsConnection(unreachable);
    const noCourseLine = describeLmsConnection(noCourse);

    expect(credentialLine).toContain("not connected");
    expect(unreachableLine).not.toContain("not connected");
    expect(noCourseLine).not.toContain("not connected");

    expect(unreachableLine).toContain("could not be read");
    expect(credentialLine).not.toContain("could not be read");
    expect(noCourseLine).not.toContain("could not be read");

    expect(noCourseLine).toContain("no Canvas course link");
    expect(credentialLine).not.toContain("no Canvas course link");
    expect(unreachableLine).not.toContain("no Canvas course link");
  });

  it("every line states the CONSEQUENCE, not only the cause", () => {
    for (const connection of [noCredential, unreachable, noCourse]) {
      expect(describeLmsConnection(connection)).toContain("recorded in this browser");
    }
  });

  it("carries the underlying detail through rather than swallowing it", () => {
    // The content tab's live-then-export precedent carries its reason
    // verbatim so the real cause is never hidden behind a vague note. This
    // carries it redacted, which is the same promise under a stricter rule.
    expect(describeLmsConnection(unreachable)).toContain("Canvas returned HTTP 503");
    expect(describeLmsConnection(noCredential)).toContain(CANVAS_CREDENTIAL_REQUIRED_MESSAGE);
    expect(describeLmsConnection(noCourse)).toContain("Add a Canvas course URL on the course tile.");
  });

  it("a blank detail leaves a whole sentence, never a trailing space", () => {
    const bare = describeLmsConnection({ state: "unavailable", reason: "unreachable", detail: "" });
    expect(bare).toBe(bare.trim());
    expect(bare.length).toBeGreaterThan(0);
  });

  it("isOfflineConnection is true for all three unavailable states", () => {
    for (const connection of [noCredential, unreachable, noCourse]) {
      expect(isOfflineConnection(connection)).toBe(true);
    }
  });
});
