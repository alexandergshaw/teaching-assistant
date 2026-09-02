import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { accumulateDroppedFrames } from "./module-deck-dispatch";

// ModuleDeckCapturePanel.tsx is a React component and nothing renders under
// this repo's vitest (node-env, collects only src/**/*.test.ts - see this
// repo's own AGENTS.md note). Every rule below is therefore either (a) a
// source-text assertion against the panel's own file - the sanctioned
// fallback for wiring a component can never otherwise prove, per this task's
// own brief - or (b) a direct re-exercise of a sibling pure function using
// the exact call shape the panel performs, so a real regression in either
// the panel's usage or the sibling's contract would show up here.
//
// Every assertion in this file was sabotage-checked while this file was
// written: the guarded line was deleted/altered in ModuleDeckCapturePanel.tsx,
// the specific `it` was confirmed red, the file was restored, and the suite
// was confirmed green again. See this task's own report for the list.

const PANEL_PATH = path.resolve(process.cwd(), "src/app/components/module-deck-capture/ModuleDeckCapturePanel.tsx");
const source = fs.readFileSync(PANEL_PATH, "utf-8");
// A stripped copy for assertions about what is actually RENDERED to the
// user (e.g. "never mentions a token count") - this file's own `//` doc
// comments legitimately discuss tokens/dollars while explaining why the
// panel must not render one, and a plain source-text search would otherwise
// false-fail on its own documentation.
const sourceWithoutLineComments = source
  .split("\n")
  .map((line) => line.replace(/\/\/.*$/, ""))
  .join("\n");

// ---------------------------------------------------------------------------
// AC12/AM-E: the persisted-key canary for THIS directory's one control-owning
// file, self-contained exactly like grading-rows.test.ts's own "grading-
// recording persisted key canary" - recording-split.structure.test.ts's scan
// is non-recursive over src/app/components/recording/ and RecordingTab.tsx
// only, so it cannot see src/app/components/module-deck-capture/ at all
// (AM-E/DE17). This is NOT the directory-wide ORDINAL canary DE17 requires -
// that is G7's (wave 3) job, covering every file this directory ends up
// with. This block only proves what THIS file itself wires, so G7's canary
// can be built from this report without re-deriving it.
// ---------------------------------------------------------------------------

describe("ta-rec-mod- persisted key canary (self-contained for this file)", () => {
  it("finds at least one ta-rec-mod-prefixed key - a check over nothing proves nothing", () => {
    const keys = source.match(/ta-rec-mod-[a-z-]*/g) ?? [];
    expect(keys.length).toBeGreaterThan(0);
  });

  it("has exactly the expected set of persisted keys (course, module, template, context)", () => {
    const keys = Array.from(new Set(source.match(/ta-rec-mod-[a-z-]*/g) ?? [])).sort();
    expect(keys).toEqual(["ta-rec-mod-context", "ta-rec-mod-course", "ta-rec-mod-module", "ta-rec-mod-template"]);
  });

  function isWired(key: string, callKind: "read" | "write"): boolean {
    const directPattern =
      callKind === "read"
        ? new RegExp(`localStorage\\.getItem\\(\\s*["']${key}["']\\s*\\)`)
        : new RegExp(`localStorage\\.setItem\\(\\s*["']${key}["']\\s*,`);
    if (directPattern.test(source)) return true;

    const constNames = Array.from(source.matchAll(new RegExp(`const\\s+(\\w+)\\s*=\\s*["']${key}["']`, "g"))).map((m) => m[1]);
    if (constNames.length === 0) return false;

    return constNames.some((name) => {
      const pattern =
        callKind === "read"
          ? new RegExp(`localStorage\\.getItem\\(\\s*${name}\\s*\\)`)
          : new RegExp(`localStorage\\.setItem\\(\\s*${name}\\s*,`);
      return pattern.test(source);
    });
  }

  it.each(["ta-rec-mod-course", "ta-rec-mod-module", "ta-rec-mod-template", "ta-rec-mod-context"])(
    '"%s" has both a localStorage read and a localStorage write wired (directly, or via a const STORAGE_KEY_* binding)',
    (key) => {
      expect(isWired(key, "read"), `expected a localStorage read wired to "${key}"`).toBe(true);
      expect(isWired(key, "write"), `expected a localStorage write wired to "${key}"`).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// AC13/point 3: never a recording blob. The simplest guarantee is to never
// even ask for one - `saveVideo: false` at every start() call site, and
// `saveVideo: true` absent from the whole file.
// ---------------------------------------------------------------------------

describe("capture never records a blob (AC13)", () => {
  it("calls start({ saveVideo: false }) at least once, in real code (not just in a comment)", () => {
    expect(sourceWithoutLineComments).toMatch(/start\(\s*\{\s*saveVideo:\s*false\s*\}\s*\)/);
  });

  it("never sets saveVideo: true anywhere in this file, including in a comment", () => {
    expect(source).not.toMatch(/saveVideo:\s*true/);
  });
});

// ---------------------------------------------------------------------------
// AC2/AM-L: the context box must actually reach the extraction prompt - the
// call to extractModuleContentAction must carry contextText as its third
// argument (buildModuleContentExtractionPrompt's own (frameCount, moduleName,
// instructorContext) signature).
// ---------------------------------------------------------------------------

describe("the context box reaches extractModuleContentAction (AC2)", () => {
  it("passes contextText as the extraction action's context argument", () => {
    const call = source.match(/extractModuleContentAction\(([\s\S]*?)\);/);
    expect(call, "expected a call to extractModuleContentAction").not.toBeNull();
    expect(call![1]).toMatch(/\bcontextText\b/);
  });

  it("passes moduleLabel as the extraction action's moduleName argument", () => {
    const call = source.match(/extractModuleContentAction\(([\s\S]*?)\);/);
    expect(call![1]).toMatch(/\bmoduleLabel\b/);
  });
});

// ---------------------------------------------------------------------------
// AM-G: the panel owns a monotone dropped-frames session accumulator, never
// reading the hook's live value directly for the log/UI. Wiring: the call
// shape itself (source text) AND a re-exercise of accumulateDroppedFrames
// with the exact sequence a Start/Stop/Start capture session would drive it
// through, proving the CONTRACT this file's effect depends on still holds.
// ---------------------------------------------------------------------------

describe("dropped-frame accumulator (AM-G)", () => {
  it("calls accumulateDroppedFrames with the live value and a ref-tracked previous value, never the live value alone", () => {
    expect(source).toMatch(/accumulateDroppedFrames\(\s*prevLiveDroppedRef\.current\s*,\s*droppedFrames\s*,/);
  });

  it("never reads the hook's live droppedFrames directly into the run log or the persistent UI notice", () => {
    // The only acceptable appearances of the identifier `droppedFrames` are:
    // destructuring it off useDiscussionCapture, and feeding it into the one
    // accumulator call above. It must never appear as the value handed to
    // buildModuleDeckCaptureRunLog's `droppedFrames` field, nor inside the
    // persistent "dropped frames" notice paragraph - both of those must read
    // droppedFramesTotal instead.
    expect(source).not.toMatch(/droppedFrames:\s*droppedFrames[,\s]/);
  });

  it("a Start/Stop/Start session's live readings survive through the panel's own accumulator contract", () => {
    // Reproduces the exact three-call sequence the panel's effect performs
    // across a two-cycle session, using the sibling pure function directly -
    // this is the regression AM-G exists to prevent (GradingRecordingPanel.
    // tsx:464 reads only the live value at download time and loses session
    // 1's drops entirely).
    let total = 0;
    total = accumulateDroppedFrames(0, 6, total); // session 1 climbs to 6
    total = accumulateDroppedFrames(6, 0, total); // Stop, then Start resets live to 0
    total = accumulateDroppedFrames(0, 3, total); // session 2 climbs to 3
    expect(total).toBe(9); // NOT 3
  });
});

// ---------------------------------------------------------------------------
// AM-L: the legibility probe runs its own capture session and must be
// disabled while a real capture is running (a second getDisplayMedia grant at
// the same time is a device conflict).
// ---------------------------------------------------------------------------

describe("legibility probe is disabled while capturing (AM-L)", () => {
  it("the probe button's disabled prop is exactly {capturing}", () => {
    // Anchor on the text, walk backward to the nearest preceding <Button, and
    // inspect only that span - never a forward `[^>]*` scan, which an
    // onClick arrow function's "=>" (itself containing a literal ">")
    // would silently truncate.
    const probeIdx = source.indexOf("Run legibility probe");
    expect(probeIdx, "expected to find the probe button's own text").toBeGreaterThan(-1);
    const tagStart = source.lastIndexOf("<Button", probeIdx);
    expect(tagStart, "expected a <Button opening tag before the probe text").toBeGreaterThan(-1);
    const tagSlice = source.slice(tagStart, probeIdx);
    // Sanity: exactly one <Button in the slice - confirms this is the one
    // button's own attribute list, not several buttons concatenated.
    expect(tagSlice.match(/<Button/g)?.length).toBe(1);
    expect(tagSlice).toMatch(/disabled=\{capturing\}/);
  });

  it("LegibilityProbeModal is imported and rendered, so the probe is actually reachable", () => {
    expect(source).toMatch(/import \{ LegibilityProbeModal \} from "\.\.\/grading-recording\/LegibilityProbeModal"/);
    expect(source).toMatch(/<LegibilityProbeModal\b/);
  });
});

// ---------------------------------------------------------------------------
// AM-C: the resolved slide count must be computed with expandTemplate and
// rendered next to the template picker BEFORE any capture starts - never
// gated on `capturing`.
// ---------------------------------------------------------------------------

describe("resolved slide count is shown before capture (AM-C)", () => {
  it("computes resolvedSlideCount with expandTemplate", () => {
    expect(source).toMatch(/resolvedSlideCount\s*=\s*useMemo\(\s*\(\)\s*=>\s*\(selectedTemplate\s*\?\s*expandTemplate\(/);
  });

  it("renders the resolved-slide-count sentence unconditionally, not inside a `capturing &&` guard", () => {
    const idx = source.indexOf("always produces");
    expect(idx, "expected the resolved-slide-count sentence to be present").toBeGreaterThan(-1);
    // Must appear strictly BEFORE the "Start capture" button text, which is
    // only reachable once, unconditionally, on every render (AM-C's "before
    // the capture starts" requirement).
    const startIdx = source.indexOf("Start capture");
    expect(idx).toBeLessThan(startIdx);
    // AND must not sit directly behind a `{capturing && ...}` guard - checked
    // by scanning the text immediately preceding it for that exact guard
    // token, which is how every conditional block in this file is written.
    const before = source.slice(Math.max(0, idx - 300), idx);
    expect(before).not.toMatch(/\{capturing\s*&&/);
  });
});

// ---------------------------------------------------------------------------
// AC9/point 8: the run log control sits immediately under the header, before
// every other control - same placement/reasoning as
// GradingRecordingPanel.tsx:493-510.
// ---------------------------------------------------------------------------

describe("run log control placement (AC9)", () => {
  it("the run log download controls appear before the course/template controls and before Start capture", () => {
    const logIdx = source.indexOf("Download run log (CSV)");
    const courseIdx = source.indexOf("Course (where the deck is saved)");
    const startIdx = source.indexOf("Start capture");
    expect(logIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeLessThan(courseIdx);
    expect(logIdx).toBeLessThan(startIdx);
  });

  it("the run log summary line is never gated on a run having happened", () => {
    // It must not be wrapped in a `{logStartedAt && ...}` or `{logBatches.
    // length > 0 && ...}` guard - grep for the summary-line call and confirm
    // no such guard token appears in the 200 characters immediately before it.
    const idx = source.indexOf("moduleDeckCaptureLogSummaryLine(");
    const before = source.slice(Math.max(0, idx - 200), idx);
    expect(before).not.toMatch(/logStartedAt\s*&&/);
    expect(before).not.toMatch(/logBatches\.length\s*>\s*0\s*&&/);
  });
});

// ---------------------------------------------------------------------------
// AC5/AM-K: cost is frames and calls only - never a token count, never a
// currency figure - anywhere in this panel's own rendered text.
// ---------------------------------------------------------------------------

describe("live cost never shows tokens or currency (AM-K)", () => {
  it("uses estimateRunCost for the live cost line", () => {
    expect(source).toMatch(/estimateRunCost\(/);
    expect(source).toMatch(/runCost\.message/);
  });

  it("never renders a dollar figure", () => {
    expect(sourceWithoutLineComments).not.toMatch(/\$\d/);
  });

  it("never mentions a token count outside of a comment", () => {
    expect(sourceWithoutLineComments).not.toMatch(/token/i);
  });
});

// ---------------------------------------------------------------------------
// DE7: the third loss channel - surfaced, never conflated with backpressure.
// ---------------------------------------------------------------------------

describe("scroll-safety limit is surfaced (DE7)", () => {
  it("calls describeScrollSafety and renders its message", () => {
    expect(source).toMatch(/describeScrollSafety\(/);
    expect(source).toMatch(/scrollSafety\.message/);
  });
});

// ---------------------------------------------------------------------------
// AC10/AC8: the deck generation button is gated on canGenerateDeck, and its
// refusal reason is rendered verbatim.
// ---------------------------------------------------------------------------

describe("deck generation gate (AC10/AC8)", () => {
  it("disables the Generate button on !generateGate.ok", () => {
    expect(source).toMatch(/disabled=\{!generateGate\.ok\}/);
  });

  it("renders generateGate.reason verbatim when refused", () => {
    expect(source).toMatch(/\{!generateGate\.ok\s*&&\s*<p[^>]*>\{generateGate\.reason\}<\/p>\}/);
  });
});

// ---------------------------------------------------------------------------
// AC8/DE15: a batch refused for wire budget is a reachable, distinctly
// logged/notified outcome - checked client-side with the exact function the
// server enforces with, never a restated approximation.
// ---------------------------------------------------------------------------

describe("wire-budget-rejected batches are a distinct, reachable outcome (AC8)", () => {
  it("checks the batch's wire bytes with checkWireBudget before dispatching", () => {
    expect(source).toMatch(/checkWireBudget\(\s*wireBytes,/);
  });

  it("logs a rejected batch with outcome \"wire-budget-rejected\", distinct from \"error\"", () => {
    expect(source).toMatch(/outcome:\s*"wire-budget-rejected"/);
  });
});

// ---------------------------------------------------------------------------
// DE19: the context box's persistence failure gets the two-tier shape - two
// distinct messages, a reduced-payload retry - never a single throw-and-lose-
// it message.
// ---------------------------------------------------------------------------

describe("context persistence failure is two-tier (DE19)", () => {
  it("defines two distinct storage-failure messages", () => {
    expect(source).toMatch(/CONTEXT_STORAGE_REDUCED_MESSAGE\s*=/);
    expect(source).toMatch(/CONTEXT_STORAGE_FULL_MESSAGE\s*=/);
    const reduced = source.match(/CONTEXT_STORAGE_REDUCED_MESSAGE\s*=\s*"([^"]*)"/)?.[1] ?? "";
    const full = source.match(/CONTEXT_STORAGE_FULL_MESSAGE\s*=\s*"([^"]*)"/)?.[1] ?? "";
    expect(reduced.length).toBeGreaterThan(0);
    expect(full.length).toBeGreaterThan(0);
    expect(reduced).not.toEqual(full);
  });

  it("retries with the text removed before falling back to the full-failure message", () => {
    expect(source).toMatch(/localStorage\.removeItem\(STORAGE_KEY_CONTEXT\)/);
  });
});

// ---------------------------------------------------------------------------
// DE18: a beforeunload guard while capturing or frames are still queued -
// settings persist regardless (no gate on the persistence effects above).
// ---------------------------------------------------------------------------

describe("beforeunload guard (DE18)", () => {
  it("registers a beforeunload handler gated on capturing || pendingFrames > 0", () => {
    expect(source).toMatch(/if\s*\(\s*!\(capturing\s*\|\|\s*pendingFrames\s*>\s*0\)\s*\)\s*return;/);
    expect(source).toMatch(/addEventListener\("beforeunload", handler\)/);
  });

  it("states plainly that an in-progress capture does not survive a reload", () => {
    expect(source).toMatch(/does not survive a reload/);
  });
});

// ---------------------------------------------------------------------------
// AM-A/AC7: the .pptx download is gated on the parsed result, never assumed.
// ---------------------------------------------------------------------------

describe("pptx download is gated on the parsed artifact (AM-A)", () => {
  it("gates the download button on artifactDownloadFormats(...).includes(\"pptx\")", () => {
    expect(source).toMatch(/artifactDownloadFormats\(savedArtifact\)\.includes\("pptx"\)/);
  });

  it("states where the deck was saved and that there is no preview here", () => {
    expect(source).toMatch(/Saved as version/);
    expect(source).toMatch(/no preview on this panel/);
  });
});
