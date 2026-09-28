import { describe, it, expect, vi, beforeEach } from "vitest";

// A39 wave 4 (docs/a39-inference-instrument-notes.md, RES-P-3): item #9's
// effect instrument, in its OWN file rather than an addition to
// extraction.test.ts (330 lines, its own -le 380). vi.mock is module-scoped
// and hoisted - a new file has zero blast radius on that file's 330 lines.
// Mocks the model seam (../llm's callLlm), never fetch - vitest.setup.ts
// throws on any real fetch and that throw is load-bearing (docs/loop/
// tests-are-network-blocked.md).
vi.mock("../llm", () => ({
  callLlm: vi.fn(),
}));

import JSZip from "jszip";
import { callLlm } from "../llm";
import { extractStudentEntries } from "./extraction";

const mockCallLlm = vi.mocked(callLlm);

// The frozen fixture (notes section 4.1), built to a rule rather than
// chosen by taste: four ROOT-level files, no folders (C1); no filename with
// four or more `_`-separated parts, so the Canvas convention never
// pre-empts the inference (C2); each leading identity run distinct, so the
// collision refusal does not fire (C3, measured in the notes:
// decideCollisionRefusal returns {status:"ok"} on this exact fixture).
const FIXTURE_FILES: ReadonlyArray<readonly [string, string]> = [
  ["essay1-AdaL.txt", "an essay about sorting"],
  ["code1-AdaL.txt", "def sort(x): pass"],
  ["essay2-GraceH.txt", "an essay about compilers"],
  ["code2-GraceH.txt", "def compile(x): pass"],
];

// Condition B (no option): today's deterministic ladder, measured in the
// notes by driving the real production functions.
const B_NAMES = ["code1", "code2", "essay1", "essay2"];
const B_FILES = [["code1-AdaL.txt"], ["code2-GraceH.txt"], ["essay1-AdaL.txt"], ["essay2-GraceH.txt"]];

// Condition A (inferFileNamesWith: "gemini", callLlm mocked to the fenced
// response below): also measured in the notes by driving the real
// inferFileNameConvention -> parseInferredFileNameLookup -> the real
// groupSubmissionsByStudent. C4 (checked below as I5, not merely asserted):
// neither "Lovelace" nor "Hopper" appears anywhere in the fixture, so
// A_NAMES is unreachable by any deterministic transform of it - the only
// provenance for it is the mocked model response.
const A_NAMES = ["Ada Lovelace", "Grace Hopper"];
const A_FILES = [
  ["code1.txt", "essay1.txt"],
  ["code2.txt", "essay2.txt"],
];

// Wrapped in a Markdown JSON fence, as a real Gemini reply usually is -
// extractJsonObject (rubric.ts:117-128) strips it, so the fence-handling
// path is exercised rather than bypassed. The two whitespace-dirty
// studentName values exercise normalizeStudentDisplay for free (notes 4.3):
// verbatim they would produce four rows instead of two.
const FENCED_RESPONSE =
  "```json\n" +
  '{"items":[\n' +
  ' {"rawFileName":"essay1-AdaL.txt","studentName":"  Ada   Lovelace ","assignmentFileName":"essay1.txt"},\n' +
  ' {"rawFileName":"code1-AdaL.txt","studentName":"Ada Lovelace","assignmentFileName":"code1.txt"},\n' +
  ' {"rawFileName":"essay2-GraceH.txt","studentName":"Grace  Hopper","assignmentFileName":"essay2.txt"},\n' +
  ' {"rawFileName":"code2-GraceH.txt","studentName":"Grace Hopper","assignmentFileName":"code2.txt"}\n' +
  "]}\n" +
  "```";

async function fixtureZipBuffer(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [name, content] of FIXTURE_FILES) zip.file(name, content);
  return zip.generateAsync({ type: "arraybuffer" });
}

// Rows may come back in any Map-iteration order in principle (notes section
// 11 item 3) - every array assertion here is re-sorted by student name
// rather than trusting the production function's own ordering.
function namesAndFilesOf(entries: Array<{ student: string; submittedFiles: Array<{ name: string }> }>) {
  const sorted = [...entries].sort((a, b) => a.student.localeCompare(b.student));
  return {
    names: sorted.map((e) => e.student),
    files: sorted.map((e) => e.submittedFiles.map((f) => f.name).sort()),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractStudentEntries - filename inference (item #9, RES-P-3)", () => {
  it("I5: the fixture carries no token the inference could be satisfied by deterministically (C4, executed as a guard, not a comment)", () => {
    const joined = FIXTURE_FILES.map(([name, content]) => `${name}\n${content}`).join("\n");
    expect(joined).not.toContain("Lovelace");
    expect(joined).not.toContain("Hopper");
  });

  it("I2: with no inferFileNamesWith option, behaviour is byte-identical to today - the baseline this wave must not disturb", async () => {
    const entries = await extractStudentEntries(await fixtureZipBuffer());
    const { names, files } = namesAndFilesOf(entries);

    expect(names).toEqual(B_NAMES);
    expect(files).toEqual(B_FILES);
    expect(mockCallLlm).not.toHaveBeenCalled();
  });

  it("I1: with inferFileNamesWith, the model-derived names and citation files reach the row, and the row set is NOT the deterministic baseline", async () => {
    mockCallLlm.mockResolvedValue({ ok: true, text: FENCED_RESPONSE });

    const entries = await extractStudentEntries(await fixtureZipBuffer(), { inferFileNamesWith: "gemini" });
    const { names, files } = namesAndFilesOf(entries);

    expect(names).toEqual(A_NAMES);
    expect(files).toEqual(A_FILES);
    expect(names).not.toEqual(B_NAMES);
    expect(mockCallLlm).toHaveBeenCalledTimes(1);
  });
});
