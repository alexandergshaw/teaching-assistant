// Tests for ./offline-answer - the single-course answer built from recorded
// work, which moved out of the route handler when D24 pushed that file past
// this repo's 1000-line ceiling.
//
// THE MOVE IS THE REASON THIS FILE EXISTS. While the same code lived inside a
// Next route handler none of it could be asserted on at all: a NextResponse
// cannot be inspected without running the handler, and the handler needs
// authentication, a database client and a model client. The same logic behind
// an injected `askModel` and `persist` is testable in a hundred milliseconds.
//
// The fixtures are local rather than imported from a sibling *.test.ts: this
// repo has already been bitten by a cross-test-file import re-running the
// other file's describe blocks.

import { describe, it, expect } from "vitest";

import { answerOfflineAsk, type OfflineAskArgs } from "./offline-answer";
import { parseOfflinePayload } from "./offline-payload";
import { DEFAULT_ENGAGEMENT_THRESHOLDS } from "./engagement";
import type { ConcernThresholds, LmsConnection } from "./types";

const NOW = "2026-06-01T00:00:00.000Z";
const NONCE = "nonce-77aa";
const THRESHOLDS: ConcernThresholds = { lowScorePercent: 65, minMissingCount: 2, staleActivityDays: 14 };
const NO_LINK: LmsConnection = {
  state: "unavailable",
  reason: "no-lms-course",
  detail: "Add a Canvas course URL on the course tile.",
};

function stripSentinel(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^STUDENTS CITED:/i.test(line.trim()))
    .join("\n")
    .trim();
}

function args(over: Partial<OfflineAskArgs> = {}): OfflineAskArgs {
  return {
    courseId: "course-1",
    courseDisplayName: "Ethical Hacking",
    promptLabel: "C1",
    rosterNames: ["Ada Lovelace", "Grace Hopper"],
    studentRepos: [],
    payload: parseOfflinePayload({ gradingRows: [], replyRows: [] }),
    question: "who are the students of concern in Ethical Hacking?",
    questionForModel: "who are the students of concern in C1?",
    concernThresholds: THRESHOLDS,
    engagementThresholds: DEFAULT_ENGAGEMENT_THRESHOLDS,
    connection: NO_LINK,
    assembledAt: NOW,
    nonce: NONCE,
    extraNotes: [],
    askModel: async () => "S1 and S2 have nothing recorded yet.\nSTUDENTS CITED: S1; S2",
    persist: async () => "entry-1",
    stripSentinel,
    describeError: (err) => (err instanceof Error ? err.message : "an unexpected error"),
    ...over,
  };
}

describe("answerOfflineAsk", () => {
  it("states which course the answer is about and how it was read, every time", () => {
    // With no picker on screen this is the only thing that tells the
    // instructor what their question resolved to (D24e).
    return answerOfflineAsk(args()).then((result) => {
      const body = result.body;
      expect(result.status).toBe(200);
      expect(body.coverageLines).toHaveLength(1);
      expect((body.coverageLines as string[])[0]).toContain("Ethical Hacking");
      expect((body.courses as { mode: string }[])[0].mode).toBe("recorded");
      expect(body.coverageComplete).toBe(true);
    });
  });

  it("hands the model the MARKER and never the course's real name", async () => {
    let text = "";
    await answerOfflineAsk(
      args({
        askModel: async (turns) => {
          text = turns
            .map((turn) => turn.parts.map((part) => ("text" in part ? part.text : "")).join(" "))
            .join(" ");
          return "ok\nSTUDENTS CITED: none";
        },
      })
    );
    expect(text).toContain("C1");
    expect(text).not.toContain("Ethical Hacking");
    expect(text).not.toContain("Ada Lovelace");
  });

  it("resolves student markers from the SAME field on this path as on every other", async () => {
    // The browser reads `students`; `offlineStudents` is kept for the older
    // shape. Two fields with different contents would be a branch that could
    // read the wrong one.
    const body = (await answerOfflineAsk(args())).body;
    expect(body.students).toEqual(body.offlineStudents);
    expect((body.students as { name: string }[]).map((s) => s.name)).toEqual(["Ada Lovelace", "Grace Hopper"]);
  });

  it("refuses rather than guessing when a name matches two students, and names the course", async () => {
    const result = await answerOfflineAsk(
      args({
        rosterNames: ["Alex Chen", "Alex Chen"],
        questionForModel: "how is Alex Chen doing in C1?",
      })
    );
    expect(result.body.status).toBe("needs-disambiguation");
    expect(result.body.message).toContain("Ethical Hacking");
    // Nothing reached the model on this path.
    expect(result.body.answerMarkdown).toBeUndefined();
  });

  it("keeps the answer on screen when only the history write failed", async () => {
    const result = await answerOfflineAsk(
      args({
        persist: async () => {
          throw new Error("supabase timed out");
        },
      })
    );
    expect(result.status).toBe(200);
    expect(result.body.entryId).toBeNull();
    expect(result.body.persistError).toBe("supabase timed out");
    expect(result.body.answerMarkdown).toBe("S1 and S2 have nothing recorded yet.");
  });

  it("reports a model failure as the model phase, with no upstream detail", async () => {
    const result = await answerOfflineAsk(
      args({
        askModel: async () => {
          throw new Error("provider said 429 for https://api.example/x?key=SECRET");
        },
      })
    );
    expect(result.status).toBe(502);
    expect(result.body.phase).toBe("model");
    expect(JSON.stringify(result.body)).not.toContain("SECRET");
  });

  it("merges the caller's own coverage notes ahead of its own", async () => {
    const result = await answerOfflineAsk(args({ extraNotes: ["Two of your courses match that name."] }));
    expect((result.body.coverageNotes as string[])[0]).toBe("Two of your courses match that name.");
    expect((result.body.coverageNotes as string[]).length).toBeGreaterThan(1);
  });

  it("reports every row the model was handed and did not write about", async () => {
    const result = await answerOfflineAsk(args({ askModel: async () => "Nothing to report." }));
    const concern = result.body.concern as { rows: unknown[]; unexplainedStudentIndices: number[] };
    expect(concern.rows.length).toBeGreaterThan(0);
    expect(concern.unexplainedStudentIndices).toHaveLength(concern.rows.length);
  });
});
