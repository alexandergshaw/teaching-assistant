import { describe, it, expect } from "vitest";
import {
  selectTranscriptionPath,
  INITIAL_RESTART_GUARD_STATE,
  recordRecognitionStart,
  decideRestartOnEnd,
  INITIAL_ANSWER_QUEUE_STATE,
  enqueueQuestion,
  startNextIfIdle,
  completeInFlight,
  nextAutoScrollState,
  isAtBottom,
  decideSettle,
  INITIAL_STOP_GUARD_STATE,
  decideStop,
  type RestartGuardState,
  type AnswerQueueState,
  type StopGuardState,
} from "./live-class-logic";

describe("selectTranscriptionPath", () => {
  it("auto prefers Web Speech when available", () => {
    expect(selectTranscriptionPath({ hasWebSpeech: true, hasSegmentedSupport: true }, "auto")).toBe("web-speech");
  });

  it("auto falls back to segmented when Web Speech is unavailable", () => {
    expect(selectTranscriptionPath({ hasWebSpeech: false, hasSegmentedSupport: true }, "auto")).toBe("segmented");
  });

  it("auto reports none when neither path is supported", () => {
    expect(selectTranscriptionPath({ hasWebSpeech: false, hasSegmentedSupport: false }, "auto")).toBe("none");
  });

  it("an explicit web-speech override is honored when supported", () => {
    expect(selectTranscriptionPath({ hasWebSpeech: true, hasSegmentedSupport: true }, "web-speech")).toBe(
      "web-speech"
    );
  });

  it("an explicit web-speech override degrades to none when unsupported, never silently running segmented", () => {
    expect(selectTranscriptionPath({ hasWebSpeech: false, hasSegmentedSupport: true }, "web-speech")).toBe("none");
  });

  it("an explicit segmented override is honored when supported", () => {
    expect(selectTranscriptionPath({ hasWebSpeech: true, hasSegmentedSupport: true }, "segmented")).toBe("segmented");
  });

  it("an explicit segmented override degrades to none when unsupported", () => {
    expect(selectTranscriptionPath({ hasWebSpeech: true, hasSegmentedSupport: false }, "segmented")).toBe("none");
  });
});

describe("restart-storm guard", () => {
  it("restarts immediately with no delay after a long-running session", () => {
    const state = recordRecognitionStart(INITIAL_RESTART_GUARD_STATE, 0);
    const decision = decideRestartOnEnd(state, 65_000); // ran ~65s, past Chrome's ~60s silence timeout
    expect(decision.action).toBe("restart");
    if (decision.action === "restart") expect(decision.delayMs).toBe(0);
    expect(decision.nextState.consecutiveFastEnds).toBe(0);
  });

  it("backs off with growing delay across consecutive fast ends", () => {
    let state: RestartGuardState = INITIAL_RESTART_GUARD_STATE;
    let now = 0;
    const delays: number[] = [];

    for (let i = 0; i < 4; i++) {
      state = recordRecognitionStart(state, now);
      now += 200; // ends almost immediately - well under the fast-end threshold
      const decision = decideRestartOnEnd(state, now);
      expect(decision.action).toBe("restart");
      if (decision.action === "restart") delays.push(decision.delayMs);
      state = decision.nextState;
      now += decision.action === "restart" ? decision.delayMs : 0;
    }

    // Each backoff must be at least as long as the previous one (non-decreasing),
    // and strictly longer at least once - a flat or shrinking backoff would let
    // a crash loop spin as fast as it likes.
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
    expect(delays.some((d, i) => i > 0 && d > delays[i - 1])).toBe(true);
  });

  it("gives up after enough consecutive fast ends in a row", () => {
    let state: RestartGuardState = INITIAL_RESTART_GUARD_STATE;
    let now = 0;
    let gaveUp = false;

    for (let i = 0; i < 10 && !gaveUp; i++) {
      state = recordRecognitionStart(state, now);
      now += 100;
      const decision = decideRestartOnEnd(state, now);
      state = decision.nextState;
      if (decision.action === "give-up") gaveUp = true;
    }

    expect(gaveUp).toBe(true);
  });

  it("a fast end followed by a long-running session resets the fast-end streak", () => {
    let state: RestartGuardState = INITIAL_RESTART_GUARD_STATE;
    state = recordRecognitionStart(state, 0);
    let decision = decideRestartOnEnd(state, 100); // fast end
    expect(decision.nextState.consecutiveFastEnds).toBe(1);

    state = recordRecognitionStart(decision.nextState, 200);
    decision = decideRestartOnEnd(state, 70_000); // ran a long time this time
    expect(decision.nextState.consecutiveFastEnds).toBe(0);
  });
});

describe("answer queue: ordering + single-flight", () => {
  it("starts the only queued item immediately when idle", () => {
    let state = INITIAL_ANSWER_QUEUE_STATE;
    state = enqueueQuestion(state, { id: "q1", question: "What is a variable?", atMs: 0 });
    const { state: nextState, toStart } = startNextIfIdle(state);
    expect(toStart?.id).toBe("q1");
    expect(nextState.inFlightId).toBe("q1");
    expect(nextState.queue).toHaveLength(0);
  });

  it("preserves FIFO order across multiple queued questions", () => {
    let state: AnswerQueueState = INITIAL_ANSWER_QUEUE_STATE;
    state = enqueueQuestion(state, { id: "q1", question: "First?", atMs: 0 });
    state = enqueueQuestion(state, { id: "q2", question: "Second?", atMs: 10 });
    state = enqueueQuestion(state, { id: "q3", question: "Third?", atMs: 20 });

    const started: string[] = [];
    let r = startNextIfIdle(state);
    started.push(r.toStart!.id);
    state = completeInFlight(r.state, r.toStart!.id);

    r = startNextIfIdle(state);
    started.push(r.toStart!.id);
    state = completeInFlight(r.state, r.toStart!.id);

    r = startNextIfIdle(state);
    started.push(r.toStart!.id);

    expect(started).toEqual(["q1", "q2", "q3"]);
  });

  it("never starts a second answer while one is already in flight (single-flight)", () => {
    let state = INITIAL_ANSWER_QUEUE_STATE;
    state = enqueueQuestion(state, { id: "q1", question: "First?", atMs: 0 });
    state = enqueueQuestion(state, { id: "q2", question: "Second?", atMs: 10 });

    const first = startNextIfIdle(state);
    expect(first.toStart?.id).toBe("q1");

    // q1 is now in flight - asking to start the next one must be a no-op.
    const second = startNextIfIdle(first.state);
    expect(second.toStart).toBeNull();
    expect(second.state.inFlightId).toBe("q1");
    expect(second.state.queue).toHaveLength(1);
  });

  it("starts the next queued item only after the in-flight one completes", () => {
    let state = INITIAL_ANSWER_QUEUE_STATE;
    state = enqueueQuestion(state, { id: "q1", question: "First?", atMs: 0 });
    state = enqueueQuestion(state, { id: "q2", question: "Second?", atMs: 10 });

    const started = startNextIfIdle(state);
    state = started.state;
    state = completeInFlight(state, "q1");

    const next = startNextIfIdle(state);
    expect(next.toStart?.id).toBe("q2");
  });

  it("ignores a stale completion for an id that is not the current in-flight one", () => {
    let state = INITIAL_ANSWER_QUEUE_STATE;
    state = enqueueQuestion(state, { id: "q1", question: "First?", atMs: 0 });
    const started = startNextIfIdle(state);
    state = started.state;
    expect(state.inFlightId).toBe("q1");

    const afterStaleComplete = completeInFlight(state, "some-other-id");
    expect(afterStaleComplete.inFlightId).toBe("q1");
  });

  it("deduplicates a question already queued or already in flight", () => {
    let state = INITIAL_ANSWER_QUEUE_STATE;
    state = enqueueQuestion(state, { id: "q1", question: "First?", atMs: 0 });
    state = enqueueQuestion(state, { id: "q1", question: "First? (again)", atMs: 5 });
    expect(state.queue).toHaveLength(1);

    const started = startNextIfIdle(state);
    state = started.state;
    const afterDupe = enqueueQuestion(state, { id: "q1", question: "First? (again)", atMs: 5 });
    expect(afterDupe.queue).toHaveLength(0);
  });
});

describe("auto-scroll suppression", () => {
  it("is at the bottom when scrolled fully down", () => {
    expect(isAtBottom({ scrollTop: 476, scrollHeight: 500, clientHeight: 24 })).toBe(true);
  });

  it("is not at the bottom when scrolled away", () => {
    expect(isAtBottom({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200 })).toBe(false);
  });

  it("suppresses auto-scroll the moment the pane is scrolled up", () => {
    expect(nextAutoScrollState({ scrollTop: 100, scrollHeight: 1000, clientHeight: 200 })).toBe(false);
  });

  it("resumes auto-scroll once the pane is back at the bottom", () => {
    expect(nextAutoScrollState({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 })).toBe(true);
  });

  it("tolerates a small rounding slack near the bottom", () => {
    expect(nextAutoScrollState({ scrollTop: 789, scrollHeight: 1000, clientHeight: 200 })).toBe(true);
  });
});

describe("decideSettle (wait for in-flight work before the final save)", () => {
  it("proceeds immediately when nothing is pending", () => {
    expect(decideSettle(0, 0, 5000)).toBe("proceed");
  });

  it("proceeds immediately when nothing is pending even if elapsed time is already large", () => {
    expect(decideSettle(0, 9999, 5000)).toBe("proceed");
  });

  it("waits while something is pending and the timeout has not been reached", () => {
    expect(decideSettle(1, 0, 5000)).toBe("wait");
    expect(decideSettle(2, 4999, 5000)).toBe("wait");
  });

  it("proceeds WITH a warning once the timeout is reached with work still outstanding", () => {
    expect(decideSettle(1, 5000, 5000)).toBe("proceed-with-warning");
    expect(decideSettle(1, 9000, 5000)).toBe("proceed-with-warning");
  });

  it("never silently drops outstanding work - past-timeout is always the warning variant, never plain proceed", () => {
    for (const pendingCount of [1, 2, 5]) {
      for (const elapsedMs of [5000, 5001, 20000]) {
        expect(decideSettle(pendingCount, elapsedMs, 5000)).toBe("proceed-with-warning");
      }
    }
  });
});

describe("decideStop (stop idempotence)", () => {
  it("the first call runs and flips the guard to stopped", () => {
    const decision = decideStop(INITIAL_STOP_GUARD_STATE);
    expect(decision.shouldRun).toBe(true);
    expect(decision.nextState.stopped).toBe(true);
  });

  it("a second call against the resulting state is a no-op", () => {
    const first = decideStop(INITIAL_STOP_GUARD_STATE);
    const second = decideStop(first.nextState);
    expect(second.shouldRun).toBe(false);
    expect(second.nextState).toEqual(first.nextState);
  });

  it("pressing stop three or more times in a row only ever runs once", () => {
    let state: StopGuardState = INITIAL_STOP_GUARD_STATE;
    let runCount = 0;
    for (let i = 0; i < 5; i++) {
      const decision = decideStop(state);
      if (decision.shouldRun) runCount += 1;
      state = decision.nextState;
    }
    expect(runCount).toBe(1);
  });
});
