import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { useDiscussionCapture } from "./useDiscussionCapture";

// A20 (docs/a20-scope.md AC5, RULING M1/Y3/W3/W5): this file did not exist
// before A20 - useDiscussionCapture.ts is a hook this repo's node-env vitest
// never renders, so the only way to check "the auto-download call exists
// exactly once, inside the mounted branch, guarded correctly, and never
// fires post-unmount" is a source-text slice, mirroring the already-shipped
// idiom at repoGrades.wiring.test.ts (slicing a handler's body between two
// literal anchors, then `toContain`/count on the slice).
//
// This is ALSO the removal test for A20's own leverage claim (Section 1 of
// the scope doc): the claim is "the download call exists, fires exactly
// once, only when requested, only while mounted" - a source-text fact, not
// an unobservable click. Delete the `triggerFileDownload(...)` call and
// assertion 3 below (the "exactly once" count) goes from 1 to 0 - RED.

const SOURCE_PATH = path.join(process.cwd(), "src/app/components/recording/useDiscussionCapture.ts");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

describe("useDiscussionCapture.ts - A20's auto-download call, pinned by anchor-sliced source text (AC5)", () => {
  // Both outer anchors must resolve BEFORE anything below reads the slice -
  // an unresolved indexOf gives -1, and slice(x, -1) silently widens to
  // nearly the whole file rather than failing loudly (RULING W5).
  const outerStart = source.indexOf("onstop = () => {");
  const outerEnd = source.indexOf("recorder.start();", outerStart);

  it("assertion 1 (anchor resolves): finds recorder.onstop's opening brace", () => {
    expect(outerStart, "expected to find recorder.onstop's opening brace").toBeGreaterThan(-1);
  });

  it("assertion 2 (anchor resolves): finds recorder.start(); after onstop's opening brace", () => {
    expect(outerEnd, "expected to find recorder.start(); after onstop's opening brace").toBeGreaterThan(outerStart);
  });

  const outerSlice = outerStart > -1 && outerEnd > outerStart ? source.slice(outerStart, outerEnd) : "";

  it("assertion 3 (removal test): triggerFileDownload( appears exactly once inside recorder.onstop", () => {
    const matches = outerSlice.match(/triggerFileDownload\(/g) ?? [];
    expect(matches.length).toBe(1);
  });

  // RULING W3's replacement for round 2's unbuildable (b)/(c): slice the
  // outer body by ITS OWN literal anchors to isolate just the mounted
  // branch, rather than reasoning about brace-matching or an enclosing `if`.
  const mountedStart = outerSlice.indexOf("if (mountedRef.current) {");
  const mountedEnd = outerSlice.indexOf("} else {", mountedStart);

  it("assertion 3 (anchor resolves, mounted sub-slice): finds if (mountedRef.current) {", () => {
    expect(mountedStart, "expected to find if (mountedRef.current) { inside recorder.onstop").toBeGreaterThan(-1);
  });

  it("assertion 4 (anchor resolves, mounted sub-slice): finds } else { after the mounted branch opens", () => {
    expect(mountedEnd, "expected to find } else { after if (mountedRef.current) {").toBeGreaterThan(mountedStart);
  });

  const mountedSlice = mountedStart > -1 && mountedEnd > mountedStart ? outerSlice.slice(mountedStart, mountedEnd) : "";
  const outsideMounted = mountedStart > -1 ? outerSlice.slice(0, mountedStart) + outerSlice.slice(mountedEnd) : outerSlice;

  it("assertion 5: triggerFileDownload( occurs exactly once inside the mounted branch and zero times outside it", () => {
    const insideMatches = mountedSlice.match(/triggerFileDownload\(/g) ?? [];
    const outsideMatches = outsideMounted.match(/triggerFileDownload\(/g) ?? [];
    expect(insideMatches.length).toBe(1);
    expect(outsideMatches.length).toBe(0);
  });

  it("assertion 6: opts.autoDownload guards the triggerFileDownload call specifically - not merely present ANYWHERE in the mounted branch (setLastSessionAutoDownload(opts.autoDownload) also contains that text and must not satisfy this alone)", () => {
    const guardIdx = mountedSlice.indexOf("if (opts.autoDownload)");
    expect(guardIdx, "expected an if (opts.autoDownload) guard inside the mounted branch").toBeGreaterThan(-1);
    const guardBlockEnd = mountedSlice.indexOf("}", guardIdx);
    expect(guardBlockEnd).toBeGreaterThan(guardIdx);
    const guardedBody = mountedSlice.slice(guardIdx, guardBlockEnd);
    expect(guardedBody).toContain("triggerFileDownload(");
  });

  // RULING M-F: downloadFileNameBase must be READ (not merely declared) in
  // the same mounted sub-slice that computes the auto-download filename -
  // dropping the argument at a call site would otherwise silently produce
  // "recording.<ext>" instead of the pinned per-surface stem, for the same
  // blob the manual link names correctly.
  it("A20/AC6 (M-F): downloadFileNameBase is read inside the mounted branch's filename expression", () => {
    expect(mountedSlice).toMatch(/opts\.downloadFileNameBase/);
  });

  it("the call uses videoExtensionFromMimeType on the resolved mime type, not a hardcoded extension", () => {
    expect(mountedSlice).toMatch(/videoExtensionFromMimeType\(resolvedMimeType\)/);
  });
});

// docs/REGRESSION.md entry 435, BL435-1: the entry states as an invariant
// that recorder.onstop sets the manual-download link (setRecordingUrl,
// :503) BEFORE it fires the automatic download (triggerFileDownload,
// :512-517) - that ordering is what makes the manual link already rendered
// if a browser refuses the automatic download. `grep -rn "setRecordingUrl"
// src --include=*.test.ts` found 0 hits before this block; `triggerFileDownload`
// over the same set found 14 (both re-run and reported in this task's final
// report).
//
// Every assertion above this line reads useDiscussionCapture.ts as TEXT -
// none of them can tell the difference between the two statements existing
// in either order. This block instead RUNS the hook. This repo's vitest is
// node-env and renders no component (docs/loop/this-repo.md section 2), so
// there is no ReactDOM/testing-library render available here - the
// established precedent for exercising a stateful hook anyway is
// useRepoGradesBulkGrade.lifecycle.test.ts's harness: mock "react" itself
// with a minimal cursor/slot useState+useRef, and call the hook function
// directly, once per "render". That harness is extended here with
// useCallback (identity passthrough - one render, no memoization needed)
// and useEffect (runs its effect body immediately - stands in for mount,
// matching mountedRef.current needing to be true before start() runs).
//
// The order is observed from OUTSIDE, per the task brief: the mocked
// setRecordingUrl setter and the mocked triggerFileDownload both push a
// marker into ONE shared array as they actually fire, and the assertion is
// that array's relative order - never a call count, never a slice of
// source text.
const h1 = vi.hoisted(() => {
  const slots: Array<{ value: unknown }> = [];
  let cursor = 0;
  const order: string[] = [];
  return {
    order,
    // Exposed only so the test can prove slot 6 really is the recordingUrl
    // setter rather than assuming it - see the guard assertion below.
    slots,
    begin: () => {
      cursor = 0;
    },
    reset: () => {
      slots.length = 0;
      cursor = 0;
      order.length = 0;
    },
    useState: (init: unknown) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof init === "function" ? (init as () => unknown)() : init };
      const s = slots[i];
      // useDiscussionCapture.ts calls useState eleven times, in this
      // literal, unconditional order, before its first useRef call:
      // capturing(0), elapsedSec(1), pendingFrames(2), stalled(3),
      // droppedFrames(4), recordingError(5), recordingUrl(6),
      // recordingBytes(7), recordingMimeType(8), lastSessionAutoDownload(9),
      // frameEncodeNotice(10). Rules of hooks guarantees that order is
      // stable across calls - the same property
      // useRepoGradesBulkGrade.lifecycle.test.ts's cursor-slot harness
      // already relies on - so slot 6 is always the recordingUrl setter.
      const isRecordingUrlSetter = i === 6;
      return [
        s.value,
        (next: unknown) => {
          if (isRecordingUrlSetter) order.push("setRecordingUrl");
          s.value = typeof next === "function" ? (next as (prev: unknown) => unknown)(s.value) : next;
        },
      ];
    },
    useRef: (init: unknown) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: { current: init } };
      return slots[i].value;
    },
    useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => void) => {
      fn();
    },
  };
});

vi.mock("react", () => ({
  useState: h1.useState,
  useRef: h1.useRef,
  useCallback: h1.useCallback,
  useEffect: h1.useEffect,
  default: { useState: h1.useState, useRef: h1.useRef, useCallback: h1.useCallback, useEffect: h1.useEffect },
}));

// The ticker is irrelevant to this ordering question - stub it out rather
// than deal with the real Worker/setInterval fallback in a node env.
vi.mock("@/lib/frame-ticker", () => ({
  startFrameTicker: () => ({ stop: () => {} }),
}));

// The other half of the marker pair. Mocked (not spied on the real export)
// because the real triggerFileDownload touches document.body - this test
// only needs to know WHEN it fired relative to setRecordingUrl.
vi.mock("../course-planning/utils", () => ({
  triggerFileDownload: (..._args: unknown[]) => {
    h1.order.push("triggerFileDownload");
  },
}));

class FakeMediaRecorder {
  static isTypeSupported(): boolean {
    return false;
  }
  ondataavailable: ((evt: { data: { size: number } }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = "recording";
  mimeType = "";
  constructor(_stream: unknown, _options?: unknown) {
    fakeRecorders.push(this);
  }
  start(): void {}
  // Firing this is what a real MediaRecorder does when the browser tells it
  // recording has stopped - it invokes .onstop, exactly the handler this
  // test is pinning the internal ordering of.
  stop(): void {
    this.state = "inactive";
    this.onstop?.();
  }
}

let fakeRecorders: FakeMediaRecorder[] = [];

describe("useDiscussionCapture.ts - BL435-1: onstop sets the manual link before firing the automatic download (observed order)", () => {
  beforeEach(() => {
    h1.reset();
    fakeRecorders = [];
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext: () => ({
              drawImage: () => {},
              getImageData: () => ({ data: new Uint8ClampedArray(4) }),
            }),
            toDataURL: () => "data:image/jpeg;base64,",
          };
        }
        // "video" (both the detached sampling video and the DOM preview
        // video use this same shape here).
        return {
          muted: false,
          playsInline: false,
          srcObject: null,
          play: () => Promise.resolve(),
          pause: () => {},
        };
      },
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: async () => ({
          getVideoTracks: () => [],
          getTracks: () => [],
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function useTestRender() {
    h1.begin();
    return useDiscussionCapture();
  }

  it("BL435-1: recorder.onstop calls setRecordingUrl before triggerFileDownload, as an observed sequence", async () => {
    const capture = useTestRender();
    await capture.start({ saveVideo: true, autoDownload: true, downloadFileNameBase: "test" });

    expect(fakeRecorders.length).toBe(1);
    // start() itself also calls setRecordingUrl(null) earlier, to clear any
    // prior session's link before this one begins recording - so the
    // marker array is not expected to be exactly two entries long. What
    // BL435-1 pins is the relative order of the LAST two entries onstop
    // itself produces: its own setRecordingUrl(url), then
    // triggerFileDownload.
    h1.order.length = 0;
    fakeRecorders[0].stop();

    // GUARD ON THE INSTRUMENT, not on the behaviour. Slot 6 is a magic index
    // into the hook's useState call order, so an inserted useState above it
    // would silently move the marker onto a different setter. Asserting the
    // slot now holds the object URL onstop produced proves the marker is on
    // the right setter - without it, that failure would arrive disguised as
    // an ordering violation and send a reader after the wrong defect.
    expect(
      typeof h1.slots[6]?.value,
      "slot 6 no longer holds the recordingUrl state - a useState was probably inserted above it, so the ordering marker is on the wrong setter",
    ).toBe("string");

    expect(h1.order).toEqual(["setRecordingUrl", "triggerFileDownload"]);
  });
});
