// BULK-ZIP W3 (docs/bulk-zip-oversize-fit-scope.md): wire strip + restore through the DEFAULT postGradeRunItem.
// Harness copied from the lifecycle test (no-cross-test-file-imports). Original note: GRADING-CHAT wave 1. The
// no-render harness is a PORT of useIncrementalGradingRun.lifecycle.test.ts's
// own h0 (its own header explains why: nothing renders in this repo's
// vitest, so one hook call is one "render", and useRef returns the SAME
// object across calls). Copied, not imported (no-cross-test-file-imports).
import { describe, expect, it, vi, beforeEach } from "vitest";

const h0 = vi.hoisted(() => {
  const slots: Array<{ value: unknown }> = [];
  let cursor = 0;
  return {
    reset: () => {
      slots.length = 0;
      cursor = 0;
    },
    begin: () => {
      cursor = 0;
    },
    useState: (init: unknown) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof init === "function" ? (init as () => unknown)() : init };
      const s = slots[i];
      return [
        s.value,
        (next: unknown) => {
          s.value = typeof next === "function" ? (next as (prev: unknown) => unknown)(s.value) : next;
        },
      ];
    },
    useRef: (init: unknown) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: { current: init } };
      return slots[i].value;
    },
  };
});

vi.mock("react", () => ({
  useState: h0.useState,
  useRef: h0.useRef,
  default: { useState: h0.useState, useRef: h0.useRef },
}));

const resolveChatRunHeaderActionMock = vi.fn();
const prepareChatSubmissionActionMock = vi.fn();
const prepareCompositeSubmissionActionMock = vi.fn();
vi.mock("@/app/actions/grading-chat-intake", () => ({
  prepareCompositeSubmissionAction: (...args: unknown[]) => prepareCompositeSubmissionActionMock(...args),
  resolveChatRunHeaderAction: (...args: unknown[]) => resolveChatRunHeaderActionMock(...args),
  prepareChatSubmissionAction: (...args: unknown[]) => prepareChatSubmissionActionMock(...args),
}));

import { useContinuousGradingRun } from "./useContinuousGradingRun";
import type { StudentSubmissionEntry } from "@/lib/grade/types";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const readyHeader = {
  kind: "ok" as const,
  effectiveRubric: "1. Correctness",
  generatedRubric: undefined,
  criteriaNames: [],
  rubricUsed: "",
  rubricFingerprint: "",
};

const file = (name: string, mimeType: string, rawBase64: string) => ({
  name, extension: name.split(".").pop() ?? "", previewContent: "", previewTruncated: false, mimeType, rawBase64,
});

beforeEach(() => {
  h0.reset();
  resolveChatRunHeaderActionMock.mockReset();
  prepareChatSubmissionActionMock.mockReset();
  resolveChatRunHeaderActionMock.mockResolvedValue(readyHeader);
});

describe("useContinuousGradingRun - W3: wire strip + Files-UI restore", () => {
  it("POSTs only visual base64 and restores the full submittedFiles on the result row", async () => {
    const posted: Array<{ entry: StudentSubmissionEntry }> = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { entry: StudentSubmissionEntry };
      posted.push(body);
      return {
        ok: true,
        json: async () => ({
          sourceIndex: 0,
          result: {
            student: "Zed", overallComment: "", strengths: "", improvements: "", resubmitNotice: "",
            rubricAreas: [], totalScore: "", feedback: "", mergedFileCount: 2,
            submittedFiles: body.entry.submittedFiles,
          },
        }),
      };
    });
    try {
      h0.begin();
      let driver = useContinuousGradingRun({ provider: "gemini" });
      await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
      h0.begin();
      driver = useContinuousGradingRun({ provider: "gemini" });
      const files = [file("a.zip", "application/zip", "ZZZZ"), file("b.pdf", "application/pdf", "PDF1")];
      prepareChatSubmissionActionMock.mockResolvedValue({
        kind: "entries",
        entries: [{ student: "Zed", content: "c", mergedFileCount: 2, submittedFiles: files }],
        pointsPossible: null,
      });
      await driver.submit({ kind: "url", url: "https://canvas.example.edu/courses/1/assignments/2" });
      await flushMicrotasks();
      await flushMicrotasks();
      expect(posted).toHaveLength(1);
      expect(posted[0].entry.submittedFiles.map((f) => f.rawBase64)).toEqual([undefined, "PDF1"]);
      h0.begin();
      driver = useContinuousGradingRun({ provider: "gemini" });
      expect(driver.results[0].submittedFiles.map((f) => f.rawBase64)).toEqual(["ZZZZ", "PDF1"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
