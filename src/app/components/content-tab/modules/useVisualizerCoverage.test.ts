// Pure-logic contract for the "Visualizer coverage" bulk-bar control
// (useVisualizerCoverage.ts). vitest here is node-env and renders no
// component (see this repo's own "vitest is node-env... no component is
// ever rendered" note), so this covers everything an executable test CAN
// reach without a renderer: the note/reason helpers, the D2 routing split
// (conceptsForLink/conceptsForCreate), and the blocker-1(d) double-click
// defense (createArmGate, a wall-clock interval driven by an injected clock -
// see that function's own comment on why the microtask version it replaced
// guarded the wrong thing). The hook's own React wiring
// (useState/useRef/useMemo calls, the async scan/link/create closures, and
// the cross-clear between the two second-click confirmations) is verified by
// READING (visualizerCoverage.wiring.test.ts's own source-text assertions),
// not by rendering - there is no seam in this hook that lets its `link`/
// `create` closures be invoked outside a real render without a renderer this
// repo does not have wired up for component tests. That limitation is
// intentional here, not an oversight: see this file's own note above the D3
// section below.
import { describe, expect, it } from "vitest";
import type { ContentSourceContext } from "../contentSourceGating";
import { LIVE_CONTENT_SOURCE } from "../contentSourceGating";
import type { CoveredConcept, GapConcept, SelectionCoverage } from "@/lib/visualizer/selection-coverage";
import type { VisualizerCreateSuccess, VisualizerLinkSuccess } from "@/app/actions/visualizer-selection";
import {
  ARM_COMMIT_MIN_MS,
  EMPTY_SELECTION_SCAN_ERROR,
  computeCreateUnavailableReason,
  computeLinkUnavailableReason,
  conceptsForCreate,
  conceptsForLink,
  createArmGate,
  createResultNote,
  linkResultNote,
  scanResultNote,
} from "./useVisualizerCoverage";

const covered = (concept: string, url = `https://visualizer.example/${concept}`): CoveredConcept => ({
  concept,
  url,
  topicKey: "algorithms",
  label: concept,
});

const gap = (concept: string, reason: GapConcept["reason"]): GapConcept => ({
  concept,
  evidence: `evidence for ${concept}`,
  reason,
});

describe("EMPTY_SELECTION_SCAN_ERROR (A6)", () => {
  it("is a non-empty, distinguishable message", () => {
    expect(EMPTY_SELECTION_SCAN_ERROR.length).toBeGreaterThan(0);
    expect(EMPTY_SELECTION_SCAN_ERROR).toMatch(/scan/i);
  });
});

describe("scanResultNote (A5/A6)", () => {
  it("reports success with a non-empty summary when the scan found concepts", () => {
    const coverage: SelectionCoverage = { covered: [covered("Binary search")], gaps: [] };
    const result = scanResultNote(coverage, []);
    expect(result.kind).toBe("success");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("A6: 'found nothing' is reported as an error, never as a success, and folds in the caller's notes verbatim", () => {
    const coverage: SelectionCoverage = { covered: [], gaps: [] };
    const result = scanResultNote(coverage, ["The extractor found no visualization-worthy concepts."]);
    expect(result.kind).toBe("error");
    expect(result.text).toContain("The extractor found no visualization-worthy concepts.");
  });

  it("is still a success when everything found was a gap (nothing covered, but not nothing found)", () => {
    const coverage: SelectionCoverage = { covered: [], gaps: [gap("Recursion", "no-match")] };
    const result = scanResultNote(coverage, []);
    expect(result.kind).toBe("success");
  });
});

describe("computeLinkUnavailableReason (C1/C2/C7)", () => {
  it("refuses before any scan", () => {
    expect(computeLinkUnavailableReason(null, "", LIVE_CONTENT_SOURCE)).toMatch(/scan the selection first/i);
  });

  it("refuses when the scan found nothing already covered", () => {
    const coverage: SelectionCoverage = { covered: [], gaps: [] };
    expect(computeLinkUnavailableReason(coverage, "1", LIVE_CONTENT_SOURCE)).toMatch(/nothing to link/i);
  });

  it("refuses an export-sourced context via gateOperation's own courseWrite wording (C7)", () => {
    const coverage: SelectionCoverage = { covered: [covered("Binary search")], gaps: [] };
    const exportCtx: ContentSourceContext = { source: "export", hasLiveCourse: true };
    expect(computeLinkUnavailableReason(coverage, "1", exportCtx)).toMatch(/stored export/i);
  });

  it("refuses when no module target has resolved", () => {
    const coverage: SelectionCoverage = { covered: [covered("Binary search")], gaps: [] };
    expect(computeLinkUnavailableReason(coverage, "", LIVE_CONTENT_SOURCE)).toMatch(/choose which module/i);
  });

  it("allows once covered concepts exist, the source can write, and a module is chosen", () => {
    const coverage: SelectionCoverage = { covered: [covered("Binary search")], gaps: [] };
    expect(computeLinkUnavailableReason(coverage, "42", LIVE_CONTENT_SOURCE)).toBeNull();
  });
});

describe("computeCreateUnavailableReason (A4/B1)", () => {
  it("refuses before any scan", () => {
    expect(computeCreateUnavailableReason(null)).toMatch(/scan the selection first/i);
  });

  it("refuses when the scan found no gaps at all", () => {
    expect(computeCreateUnavailableReason({ covered: [], gaps: [] })).toMatch(/nothing to create/i);
  });

  it("refuses when every gap matched a topic that cannot receive a new page", () => {
    const coverage: SelectionCoverage = { covered: [], gaps: [gap("Big-O notation", "topic-not-creatable")] };
    expect(computeCreateUnavailableReason(coverage)).toMatch(/cannot receive a new page/i);
  });

  it("allows once at least one no-match gap exists, even alongside a not-creatable one", () => {
    const coverage: SelectionCoverage = {
      covered: [],
      gaps: [gap("Big-O notation", "topic-not-creatable"), gap("Recursion", "no-match")],
    };
    expect(computeCreateUnavailableReason(coverage)).toBeNull();
  });
});

describe("linkResultNote (C3/C6)", () => {
  it("names linked, skipped (C5), and failed concepts, and is an error when anything failed", () => {
    const success: VisualizerLinkSuccess = {
      linked: ["Recursion"],
      skipped: ["Binary search"],
      failed: [{ concept: "Big-O notation", error: "network timeout" }],
    };
    const result = linkResultNote("Week 3", success);
    expect(result.kind).toBe("error");
    expect(result.text).toContain("Recursion");
    expect(result.text).toContain("Binary search");
    expect(result.text).toContain("Big-O notation");
    expect(result.text).toContain("network timeout");
    expect(result.text).toContain("Week 3");
  });

  it("is a success when nothing failed, even if some were skipped as already present", () => {
    const success: VisualizerLinkSuccess = { linked: ["Recursion"], skipped: ["Binary search"], failed: [] };
    expect(linkResultNote("Week 3", success).kind).toBe("success");
  });

  it("never claims a Canvas-only write touched the visualizer repo (C7)", () => {
    const success: VisualizerLinkSuccess = { linked: ["Recursion"], skipped: [], failed: [] };
    expect(linkResultNote("Week 3", success).text).toMatch(/nothing was written to the visualizer repo/i);
  });
});

describe("createResultNote (B2/B3/B4)", () => {
  it("names created (with URLs), skipped (B4's re-check), and failed concepts", () => {
    const success: VisualizerCreateSuccess = {
      created: [{ concept: "Recursion", url: "https://visualizer.example/recursion" }],
      skipped: ["Binary search"],
      failed: [{ concept: "Linked lists", error: "generation failed" }],
    };
    const result = createResultNote(success);
    expect(result.kind).toBe("error");
    expect(result.text).toContain("Recursion");
    expect(result.text).toContain("https://visualizer.example/recursion");
    expect(result.text).toContain("Binary search");
    expect(result.text).toContain("Linked lists");
    expect(result.text).toContain("generation failed");
  });

  it("never claims a visualizer-repo-only write touched Canvas (B5)", () => {
    const success: VisualizerCreateSuccess = { created: [{ concept: "Recursion", url: "https://x" }], skipped: [], failed: [] };
    expect(createResultNote(success).text).toMatch(/nothing was written to canvas/i);
  });
});

describe("D2: conceptsForLink / conceptsForCreate never swap the two halves of a scan", () => {
  // The defect this pins: a hook that CLASSIFIES covered vs. gap correctly
  // but then feeds the wrong half to the wrong action - link() acting on
  // gaps, or create() acting on covered concepts. A fixture that contains
  // one of each kind (covered, no-match gap, not-creatable gap) proves each
  // function returns ONLY its own kind.
  const coverage: SelectionCoverage = {
    covered: [covered("Binary search")],
    gaps: [gap("Recursion", "no-match"), gap("Big-O notation", "topic-not-creatable")],
  };

  it("conceptsForLink returns exactly the covered concepts", () => {
    expect(conceptsForLink(coverage)).toEqual(coverage.covered);
  });

  it("conceptsForLink never returns a gap concept", () => {
    const names = conceptsForLink(coverage).map((c) => c.concept);
    expect(names).not.toContain("Recursion");
    expect(names).not.toContain("Big-O notation");
  });

  it("conceptsForCreate returns only the no-match gap, excluding the covered concept AND the not-creatable gap", () => {
    const names = conceptsForCreate(coverage).map((g) => g.concept);
    expect(names).toEqual(["Recursion"]);
  });

  it("the two functions never agree on a concept name for a mixed fixture (the swap-detector)", () => {
    // If someone swapped the implementations (conceptsForLink returning
    // gaps, conceptsForCreate returning covered concepts), this fixture -
    // which has non-overlapping names by construction - would still pass a
    // weaker "returns something" test but fail this direct cross-check.
    const linkNames = new Set(conceptsForLink(coverage).map((c) => c.concept));
    const createNames = new Set(conceptsForCreate(coverage).map((g) => g.concept));
    for (const name of linkNames) expect(createNames.has(name)).toBe(false);
    for (const name of createNames) expect(linkNames.has(name)).toBe(false);
  });

  it("an all-gap coverage produces nothing for conceptsForLink", () => {
    const gapOnly: SelectionCoverage = { covered: [], gaps: [gap("Recursion", "no-match")] };
    expect(conceptsForLink(gapOnly)).toEqual([]);
  });

  it("an all-covered coverage produces nothing for conceptsForCreate", () => {
    const coveredOnly: SelectionCoverage = { covered: [covered("Binary search")], gaps: [] };
    expect(conceptsForCreate(coveredOnly)).toEqual([]);
  });
});

describe("createArmGate - blocker 1(d)'s double-click/double-Enter defense", () => {
  // This is the ONE piece of blocker 1(d) that is fully testable without a
  // renderer: `useVisualizerCoverage`'s own `link`/`create` closures use this
  // exact gate (see visualizerCoverage.wiring.test.ts's own "checks
  // isConfirmArmed before performing the write" tests, which pin that
  // `link()`/`create()` still gate on `isConfirmArmed` for the SELECTION
  // signature; the gate tested here is the ADDITIONAL, independent temporal
  // guard layered on top - see useVisualizerCoverage.ts's own ArmGate doc
  // comment). Exercising `link()`/`create()` themselves end-to-end would
  // require rendering the hook (they close over React state via useState/
  // useRef) - not possible here (vitest node-env, no component renderer in
  // this repo) - so this is the seam that lets the mechanism be proven
  // directly instead.
  // A CONTROLLED CLOCK, not real time: `createArmGate` takes `now` as a
  // parameter precisely so this race can be exercised exactly, with no timers
  // harness and no real waiting.
  function fakeClock(start = 1_000) {
    let t = start;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
  }

  it("a double click cannot commit: the second click lands inside the minimum arm interval", () => {
    const clock = fakeClock();
    const gate = createArmGate(clock.now);
    gate.arm();
    // A double click's second press arrives as its OWN browser event, in its
    // own task, typically 100-250ms after the first. This is the case an
    // earlier microtask-based gate did NOT catch: microtasks flush at the end
    // of the first click's task, so by the second click the gate was already
    // open. Time is what actually separates the two.
    clock.advance(150);
    expect(gate.canCommit()).toBe(false);
  });

  it("is not committable in the same synchronous tick either", () => {
    const clock = fakeClock();
    const gate = createArmGate(clock.now);
    gate.arm();
    expect(gate.canCommit()).toBe(false);
  });

  it("becomes committable once the arm has stood for the minimum interval (a real, considered second click)", () => {
    const clock = fakeClock();
    const gate = createArmGate(clock.now);
    gate.arm();
    clock.advance(ARM_COMMIT_MIN_MS);
    expect(gate.canCommit()).toBe(true);
  });

  it("the boundary is inclusive at the interval and closed just below it", () => {
    const clock = fakeClock();
    const gate = createArmGate(clock.now);
    gate.arm();
    clock.advance(ARM_COMMIT_MIN_MS - 1);
    expect(gate.canCommit()).toBe(false);
    clock.advance(1);
    expect(gate.canCommit()).toBe(true);
  });

  it("disarm() clears committability even after the interval has elapsed", () => {
    const clock = fakeClock();
    const gate = createArmGate(clock.now);
    gate.arm();
    clock.advance(ARM_COMMIT_MIN_MS);
    expect(gate.canCommit()).toBe(true);
    gate.disarm();
    expect(gate.canCommit()).toBe(false);
  });

  it("a re-arm restarts the interval - an old arm's elapsed time never carries over", () => {
    const clock = fakeClock();
    const gate = createArmGate(clock.now);
    gate.arm();
    clock.advance(ARM_COMMIT_MIN_MS);
    gate.arm(); // re-armed: the clock starts again from here
    expect(gate.canCommit()).toBe(false);
    clock.advance(ARM_COMMIT_MIN_MS);
    expect(gate.canCommit()).toBe(true);
  });

  it("two gates (one per action) never share arm state - proves D3's 'armed independently of each other'", () => {
    const clock = fakeClock();
    const linkGate = createArmGate(clock.now);
    const createGate = createArmGate(clock.now);
    linkGate.arm();
    clock.advance(ARM_COMMIT_MIN_MS);
    expect(linkGate.canCommit()).toBe(true);
    expect(createGate.canCommit()).toBe(false);
    createGate.arm();
    clock.advance(ARM_COMMIT_MIN_MS);
    expect(createGate.canCommit()).toBe(true);
    // Arming the create gate must not retroactively affect the already-armed
    // link gate's own committability.
    expect(linkGate.canCommit()).toBe(true);
  });
});

// D3's OTHER half - "disarmed by a selection change or a re-scan, and armed
// independently of each other" for the REAL `linkArmedFor`/`createArmedFor`
// selection-signature state (as opposed to the temporal ArmGate tested
// above) - is pinned by visualizerCoverage.wiring.test.ts's own source-text
// assertions ("a fresh scan disarms BOTH link and create unconditionally",
// "changing the module target invalidates a pending link confirmation", and
// the two new blocker-1(c) cross-clear assertions added alongside this
// file). That mechanism is confirmArming.ts's own `isConfirmArmed`/
// `selectionSignature` (already covered by confirmArming.test.ts) applied to
// state that lives inside `useVisualizerCoverage`'s closures - there is no
// seam to invoke `link`/`create` as plain functions without a React renderer
// (they read/write real `useState`/`useRef` hook state), so THAT specific
// combination - real hook state, exercised end-to-end - is the one part of
// D2/D3 this file cannot reach with an executable test. Stated plainly per
// this task's own instruction, rather than writing a test that only
// appears to cover it.
