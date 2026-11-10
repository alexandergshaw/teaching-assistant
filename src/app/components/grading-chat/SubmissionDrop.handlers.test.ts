/* eslint-disable @typescript-eslint/no-explicit-any -- The JSX shim traverses dynamic handler props. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { markSessionChanged, submitAssignedFiles, submitDropBatch, suggestFileGroups } from "./submissionDropRoutes";
import { claimIntake, releaseIntake, resetIntake, type IntakeFence } from "./intakeFence";
import type { SubmitOutcome } from "./useContinuousGradingRun";
import { hasSubmissionContent, isPastedDiscussionListing, parsePastedSubmissions } from "./pastedSubmissions";
import { hasDiscussionResponseContent } from "./discussionListing";
import { CHAT_LABEL_MAX_CHARS } from "./chatSubmissionIntake";
import { buildReviewedDiscussionGroups } from "@/lib/grade/reviewed-discussion-groups";
import { getGeminiMaxCharsPerSubmission } from "@/lib/gemini";

type Node = { type: string; props: Record<string, any> };
const slots: { value: any; deps?: unknown[] }[] = [];
let cursor = 0;
const useState = (initial: unknown) => { const slot = slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial }; return [slot.value, (next: any) => { slot.value = typeof next === "function" ? next(slot.value) : next; }]; };
const useRef = (initial: unknown) => { const slot = slots[cursor++] ??= { value: { current: initial } }; return slot.value; };
const useEffect = (effect: () => unknown, deps: unknown[]) => { const slot = slots[cursor++] ??= { value: undefined }; if (!slot.deps || deps.some((v, i) => v !== slot.deps?.[i])) { slot.deps = deps; effect(); } };
const source = readFileSync("src/app/components/grading-chat/SubmissionDrop.tsx", "utf8");
const file = ts.createSourceFile("SubmissionDrop.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = file.statements.filter((statement) => ts.isFunctionDeclaration(statement) && ["SubmissionDrop", "reconcileRowAfterReset"].includes(statement.name?.text ?? ""));
const code = ts.transpileModule(declarations.map((d) => d.getText(file).replace(/^export\s+/, "")).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
const components = ["Alert", "Accordion", "AccordionDetails", "AccordionSummary", "Box", "Button", "Checkbox", "Dialog", "DialogActions", "DialogContent", "DialogTitle", "FormControl", "FormControlLabel", "FormLabel", "Radio", "RadioGroup", "TextField", "Typography"];
const factory = new Function("exports", "require", "useState", "useRef", "useEffect", "ROLE_FILE_LIMIT", "submitAssignedFiles", "submitDropBatch", "suggestFileGroups", "markSessionChanged", "claimIntake", "releaseIntake", "resetIntake", "parsePastedSubmissions", "hasSubmissionContent", "isPastedDiscussionListing", "hasDiscussionResponseContent", "CHAT_LABEL_MAX_CHARS", "buildReviewedDiscussionGroups", "getGeminiMaxCharsPerSubmission", "window", ...components, `${code}; return SubmissionDrop;`);
const component = factory({}, (id: string) => id === "react/jsx-runtime" ? { jsx, jsxs: jsx } : {}, useState, useRef, useEffect, 40, submitAssignedFiles, submitDropBatch, suggestFileGroups, markSessionChanged, claimIntake, releaseIntake, resetIntake, parsePastedSubmissions, hasSubmissionContent, isPastedDiscussionListing, hasDiscussionResponseContent, CHAT_LABEL_MAX_CHARS, buildReviewedDiscussionGroups, getGeminiMaxCharsPerSubmission, { addEventListener() {}, removeEventListener() {} }, ...components);
function nodes(node: any): Node[] { if (Array.isArray(node)) return node.flatMap(nodes); if (!node || typeof node !== "object") return []; return [node, ...nodes(node.props?.children)]; }
const text = (node: any): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : !node || typeof node !== "object" ? "" : text(node.props?.children);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => { slots.length = 0; cursor = 0; });
function harness(onOne = vi.fn(async () => ({ kind: "accepted", entryCount: 1 })), onMany = vi.fn(async () => [] as any[]), onText: (student: string, content: string) => Promise<SubmitOutcome> = vi.fn(async (): Promise<SubmitOutcome> => ({ kind: "accepted", entryCount: 1 })), sharedLatch?: IntakeFence, reviewFiles = false, onReviewed?: (...args: any[]) => Promise<SubmitOutcome>) {
  let epoch = 0;
  const render = () => { cursor = 0; return component({ disabled: false, sharedLatch, reviewFiles, onOne, onMany, onText, onReviewed, getSessionEpoch: () => epoch, sessionEpoch: epoch }); };
  const find = (tree: Node, type: string) => nodes(tree).find((node) => node.type === type)!;
  const button = (tree: Node, label: string) => nodes(tree).find((node) => node.type === "Button" && text(node) === label)!;
  const confirmText = (tree: Node) => { for (const label of nodes(tree).filter((n) => n.type === "FormControlLabel" && String(n.props.label).startsWith("I checked the name and complete submission"))) label.props.control.props.onChange(null, true); return render(); };
  const reset = () => { epoch++; };
  return { render, find, button, reset, confirmText, onOne, onMany, onText };
}
const work = (name: string) => new File(["work"], name);

describe("SubmissionDrop actual handlers", () => {
  it("grades an explicitly reviewed generic paste in one action", async () => {
    const h = harness(); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    const value = "Student: Ada Example\nAn essay with https://example.org and a quote.\nStudent: Riley Example\nconst answer = 42;";
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value } }); tree = h.render();
    h.button(tree, "I reviewed all names and submissions; grade").props.onClick(); await flush();
    expect(h.onText).toHaveBeenCalledTimes(2);
    expect(h.onText).toHaveBeenNthCalledWith(1, "Ada Example", "Student: Ada Example\nAn essay with https://example.org and a quote.");
    expect(h.onText).toHaveBeenNthCalledWith(2, "Riley Example", "Student: Riley Example\nconst answer = 42;");
  });
  it("does not grade duplicate or unassigned names via the reviewed-all action", async () => {
    for (const value of ["Student: Ada Example\nFirst\nStudent: Ada Example\nSecond", "Unassigned preamble\nStudent: Ada Example\nAnswer"]) {
      slots.length = 0;
      const h = harness(); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
      nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value } }); tree = h.render();
      h.button(tree, "I reviewed all names and submissions; grade").props.onClick(); await flush(); expect(h.onText).not.toHaveBeenCalled();
    }
  });
  it("fences rapid repeated reviewed-all clicks", async () => {
    let finish!: (value: SubmitOutcome) => void;
    const onText = vi.fn().mockImplementationOnce(() => new Promise<SubmitOutcome>((resolve) => { finish = resolve; })).mockResolvedValue({ kind: "accepted", entryCount: 1 });
    const h = harness(undefined, undefined, onText); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Student: Ada\nA\nStudent: Bob\nB" } }); tree = h.render();
    const click = h.button(tree, "I reviewed all names and submissions; grade").props.onClick; click(); click(); expect(onText).toHaveBeenCalledTimes(1);
    finish({ kind: "accepted", entryCount: 1 }); await flush(); expect(onText.mock.calls.map((call) => call[0])).toEqual(["Ada", "Bob"]);
  });
  it("retries refused work without repeating accepted work via reviewed-all", async () => {
    const onText = vi.fn().mockResolvedValueOnce({ kind: "accepted", entryCount: 1 }).mockResolvedValueOnce({ kind: "refused", reason: "not ready" }).mockResolvedValueOnce({ kind: "accepted", entryCount: 1 });
    const h = harness(undefined, undefined, onText); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Student: Ada\nA\nStudent: Bob\nB" } }); tree = h.render();
    h.button(tree, "I reviewed all names and submissions; grade").props.onClick(); await flush(); tree = h.render();
    expect(onText.mock.calls.map((call) => call[0])).toEqual(["Ada", "Bob"]); expect(text(tree)).toContain("not ready");
    h.button(tree, "I reviewed all names and submissions; grade").props.onClick(); await flush(); expect(onText.mock.calls.map((call) => call[0])).toEqual(["Ada", "Bob", "Bob"]);
  });
  it("holds an uncertain reviewed-all result without dispatching the next student", async () => {
    const onText = vi.fn().mockResolvedValue({ kind: "partial", dispatchedCount: 1, refusedCount: 1, reason: "unknown" });
    const h = harness(undefined, undefined, onText); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Student: Ada\nA\nStudent: Bob\nB" } }); tree = h.render();
    h.button(tree, "I reviewed all names and submissions; grade").props.onClick(); await flush(); tree = h.render();
    expect(onText).toHaveBeenCalledTimes(1); expect(h.button(tree, "I reviewed all names and submissions; grade").props.disabled).toBe(true);
    h.button(tree, "I reviewed all names and submissions; grade").props.onClick(); await flush(); expect(onText).toHaveBeenCalledTimes(1);
  });
  it("clears discussion attestations after editing source and when starting a new paste", () => {
    const h = harness(undefined, undefined, undefined, undefined, false, vi.fn()); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    const paste = (value: string) => { nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value } }); tree = h.render(); };
    paste("Ada Chen posted Sep 3, 2026\nFirst answer");
    nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === "Classify initial posts and replies for separate grading")!.props.control.props.onChange(null, true); tree = h.render();
    const labels = ["I verified entries assigned to each group belong to the same person", "I verified all initial posts and replies for these students are included", "I accounted for any attachments"];
    const affirm = () => { for (const label of labels) nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === label)!.props.control.props.onChange(null, true); tree = h.render(); };
    const expectCleared = () => { for (const label of labels) expect(nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === label)!.props.control.props.checked).toBe(false); };
    affirm(); nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission 1")!.props.onChange({ target: { value: "Changed answer" } }); tree = h.render(); expectCleared();
    affirm(); h.button(tree, "Clear text list").props.onClick(); tree = h.render(); nodes(tree).filter((n) => n.type === "Button" && text(n) === "Clear list").at(-1)!.props.onClick(); tree = h.render();
    paste("Grace Vale posted Sep 4, 2026\nNew answer"); expectCleared();
  });
  it.each([false, true])("blocks normalized duplicate groups including already queued identities (queued=%s)", async (queued) => {
    const onReviewed = vi.fn().mockResolvedValueOnce({ kind: "accepted", entryCount: 1 }).mockResolvedValueOnce({ kind: "refused", reason: "not ready" });
    const h = harness(undefined, undefined, undefined, undefined, false, onReviewed); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Ada Chen posted Sep 3, 2026\nFirst answer\nGrace Vale posted Sep 4, 2026\nSecond answer" } });
    tree = h.render(); nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === "Classify initial posts and replies for separate grading")!.props.control.props.onChange(null, true); tree = h.render();
    for (let i = 1; i <= 2; i++) {
      nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === `I checked author and response ${i}`)!.props.control.props.onChange(null, true);
      nodes(tree).find((n) => n.type === "TextField" && n.props.label === `Student group for entry ${i}`)!.props.onChange({ target: { value: i === 1 ? "Ada" : queued ? "Grace" : "ＡＤＡ" } });
      nodes(tree).find((n) => n.type === "RadioGroup" && n.props.value === "unassigned")!.props.onChange({ target: { value: "initial" } }); tree = h.render();
    }
    const affirm = () => { for (const label of ["I verified entries assigned to each group belong to the same person", "I verified all initial posts and replies for these students are included", "I accounted for any attachments"]) nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === label)!.props.control.props.onChange(null, true); tree = h.render(); };
    affirm(); h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); tree = h.render();
    if (!queued) { expect(onReviewed).not.toHaveBeenCalled(); return; }
    expect(onReviewed).toHaveBeenCalledTimes(2);
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student group for entry 2")!.props.onChange({ target: { value: "ＡＤＡ" } }); tree = h.render(); affirm();
    h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); tree = h.render();
    expect(onReviewed).toHaveBeenCalledTimes(2); expect(text(tree)).toContain("already submitted");
  });
  it("marks an in-flight discussion group uncertain on reset and does not dispatch the next group", async () => {
    let finish!: (value: SubmitOutcome) => void;
    const onReviewed = vi.fn(() => new Promise<SubmitOutcome>((resolve) => { finish = resolve; }));
    const h = harness(undefined, undefined, undefined, undefined, false, onReviewed); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Ada Chen posted Sep 3, 2026\nFirst answer\nGrace Vale posted Sep 4, 2026\nSecond answer" } });
    tree = h.render(); nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === "Classify initial posts and replies for separate grading")!.props.control.props.onChange(null, true); tree = h.render();
    for (let i = 1; i <= 2; i++) {
      nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === `I checked author and response ${i}`)!.props.control.props.onChange(null, true);
      nodes(tree).find((n) => n.type === "TextField" && n.props.label === `Student group for entry ${i}`)!.props.onChange({ target: { value: i === 1 ? "Ada" : "Grace" } });
      nodes(tree).find((n) => n.type === "RadioGroup" && n.props.value === "unassigned")!.props.onChange({ target: { value: "initial" } }); tree = h.render();
    }
    for (const label of ["I verified entries assigned to each group belong to the same person", "I verified all initial posts and replies for these students are included", "I accounted for any attachments"]) nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === label)!.props.control.props.onChange(null, true);
    tree = h.confirmText(h.render()); h.button(tree, "Grade reviewed submissions").props.onClick(); h.reset(); tree = h.render(); finish({ kind: "accepted", entryCount: 1 }); await flush(); tree = h.render();
    expect(onReviewed).toHaveBeenCalledTimes(1); expect(text(tree)).toContain("Needs review");
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission 2")!.props.value).toContain("Second answer");
  });
  it("holds an ambiguous Canvas block after a valid post unassigned", async () => {
    const h = harness(); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    const value = "Jordan Example\nJordan Example\nSep 6, 2026\nSep 6 at 10pm\nManage Discussion Entry\nFirst synthetic reply\nCollapse Subdiscussion\nTaylor Example\nDifferent Example\nSep 6, 2026\nSep 6 at 11:50pm\nManage Discussion Entry\nSecond synthetic reply";
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value } }); tree = h.render();
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student 1")!.props.value).toBe("Jordan Example");
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student 2")!.props.value).toBe("");
    expect(nodes(tree).filter((n) => n.type === "TextField" && /^Submission \d+$/.test(String(n.props.label))).map((n) => n.props.value).join("\n")).toBe(value);
    h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); expect(h.onText).not.toHaveBeenCalled();
  });
  it("shows an inactive Canvas author separately from the prior reply", () => {
    const h = harness(); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    const value = "Jordan Example\nJordan Example\nSep 6, 2026\nSep 6 at 10pm\nManage Discussion Entry\nSynthetic reply\nCollapse Subdiscussion\nTaylor Example\nTaylor Example inactive\nSep 6, 2026\nSep 6 at 11:50pm\nManage Discussion Entry\nSynthetic post";
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value } }); tree = h.render();
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student 1")!.props.value).toBe("Jordan Example");
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student 2")!.props.value).toBe("Taylor Example");
    expect(nodes(tree).filter((n) => n.type === "TextField" && /^Submission \d+$/.test(String(n.props.label))).map((n) => n.props.value).join("\n")).toBe(value);
    expect(h.onText).not.toHaveBeenCalled();
  });
  it("holds copied Canvas nested posts as distinct editable review rows", async () => {
    const h = harness(); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    const value = "Collapse Subdiscussion\nJordan Example\nJordan Example\nSep 6, 2026\nSep 6 at 10pm\nManage Discussion Entry\n\nFirst synthetic response\nCollapse Subdiscussion\nTaylor Example\nTaylor Example\nSep 7, 2026\nSep 7 at 9:30am\nManage Discussion Entry\n\nNested synthetic reply";
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value } }); tree = h.render();
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student 2")!.props.value).toBe("Jordan Example");
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student 3")!.props.value).toBe("Taylor Example");
    expect(nodes(tree).filter((n) => n.type === "TextField" && /^Submission \d+$/.test(String(n.props.label))).map((n) => n.props.value).join("\n")).toBe(value);
    h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); expect(h.onText).not.toHaveBeenCalled();
  });
  it("requires explicit missing-initial and source attestations before handing off a reply", async () => {
    const onReviewed = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 });
    const h = harness(undefined, undefined, undefined, undefined, false, onReviewed); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Jordan Example posted Sep 6, 2026\nA synthetic reply" } }); tree = h.render();
    nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === "Classify initial posts and replies for separate grading")!.props.control.props.onChange(null, true); tree = h.render();
    nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === "I checked author and response 1")!.props.control.props.onChange(null, true);
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student group for entry 1")!.props.onChange({ target: { value: "Jordan Example" } });
    nodes(tree).find((n) => n.type === "RadioGroup" && n.props.value === "unassigned")!.props.onChange({ target: { value: "reply" } }); tree = h.render();
    for (const label of ["I verified entries assigned to each group belong to the same person", "I verified all initial posts and replies for these students are included", "I accounted for any attachments"]) nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === label)!.props.control.props.onChange(null, true);
    tree = h.render(); h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); expect(onReviewed).not.toHaveBeenCalled();
    nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === "I verified Jordan Example has no initial post in the complete source; score initial criteria as zero")!.props.control.props.onChange(null, true); tree = h.render();
    h.button(tree, "Grade reviewed submissions").props.onClick(); await flush();
    expect(onReviewed).toHaveBeenCalledWith("Jordan Example", expect.stringContaining("A synthetic reply"), expect.objectContaining({ initialAbsenceConfirmed: true, sourceCompleteConfirmed: true, replies: [expect.stringContaining("A synthetic reply")] }));
  });
  it("keeps a suspected whole board out of the single-student fallback", async () => {
    const onText = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 });
    const h = harness(undefined, undefined, onText); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Discussion board\nUnread post\nPartial post without date" } });
    tree = h.render(); expect(nodes(tree).some((n) => n.type === "TextField" && n.props.label === "Student for this text")).toBe(false);
    expect(text(tree)).toContain("unassigned text"); h.button(tree, "Grade reviewed submissions").props.onClick(); await flush();
    expect(onText).not.toHaveBeenCalled();
  });
  it("requires an explicit same-person confirmation before combining duplicate names", async () => {
    const onText = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 });
    const h = harness(undefined, undefined, onText); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Alex Kim posted 10/1/2026\nInitial\nAlex Kim posted 10/2/2026\nReply" } });
    tree = h.render(); for (const label of nodes(tree).filter((n) => n.type === "FormControlLabel" && String(n.props.label).startsWith("I checked author"))) label.props.control.props.onChange(null, true); tree = h.render(); h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); expect(onText).not.toHaveBeenCalled();
    h.button(tree, "Combine entries").props.onClick(); tree = h.render(); h.button(tree, "Combine").props.onClick(); tree = h.render();
    nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === "I checked author and response 1")!.props.control.props.onChange(null, true); tree = h.render();
    h.button(tree, "Grade reviewed submissions").props.onClick(); await flush();
    expect(onText).toHaveBeenCalledTimes(1); expect(onText.mock.calls[0][1]).toContain("Initial\n\n---\n\nAlex Kim posted 10/2/2026\nReply");
  });
  it("cannot grade a dated header with only page controls even when reviewed", async () => {
    const onText = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 }); const h = harness(undefined, undefined, onText); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Ada Chen posted Sep 3, 2026\n2 replies\nGrace Vale posted Sep 4, 2026\nReal answer" } });
    tree = h.render(); for (const label of nodes(tree).filter((n) => n.type === "FormControlLabel" && String(n.props.label).startsWith("I checked author"))) label.props.control.props.onChange(null, true); tree = h.render();
    h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); expect(onText).not.toHaveBeenCalled();
  });
  it("rejects labels that the grading handoff would truncate", async () => {
    const onText = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 }); const h = harness(undefined, undefined, onText); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: `Student: ${"A".repeat(501)}\nAnswer\nStudent: Bob\nAnswer` } });
    tree = h.confirmText(h.render()); h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); tree = h.render();
    expect(onText).not.toHaveBeenCalled(); expect(text(tree)).toContain("at most 500 characters");
  });
  it("does not grade a heading without student work", () => {
    const h = harness(); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Student: Ada\nStudent: Bob\nB" } });
    tree = h.render(); h.button(tree, "Grade reviewed submissions").props.onClick(); tree = h.render();
    expect(h.onText).not.toHaveBeenCalled(); expect(text(tree)).toContain("beyond the heading");
  });
  it("preserves reviewed edits when an original-paste change arrives before rerender", () => {
    const h = harness(); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Student: Ada\nA\nStudent: Bob\nB" } });
    tree = h.render(); const original = nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!;
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission 1")!.props.onChange({ target: { value: "Corrected A" } });
    original.props.onChange({ target: { value: "replacement" } }); tree = h.render();
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission 1")!.props.value).toBe("Corrected A");
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.disabled).toBe(true);
  });
  it("parses text already entered when switching to multiple students", async () => {
    const onText = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 }); const h = harness(undefined, undefined, onText); let tree = h.render();
    const input = "Student: Example One\nFirst\nStudent: Example Two\nSecond";
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: input } });
    tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission 1")!.props.value).toBe("Student: Example One\nFirst");
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission 2")!.props.value).toBe("Student: Example Two\nSecond");
    tree = h.confirmText(tree); h.button(tree, "Grade reviewed submissions").props.onClick(); await flush();
    expect(onText.mock.calls).toEqual([["Example One", "Student: Example One\nFirst"], ["Example Two", "Student: Example Two\nSecond"]]);
  });
  it("holds a headed URL for review and submits its literal contents", async () => {
    const onText = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 }); const h = harness(undefined, undefined, onText); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    const input = "Student: Example\nhttps://github.com/example/repo";
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: input } });
    tree = h.render(); h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); expect(onText).not.toHaveBeenCalled();
    tree = h.confirmText(h.render()); h.button(tree, "Grade reviewed submissions").props.onClick(); await flush();
    expect(onText).toHaveBeenCalledWith("Example", input);
  });
  it("stops a pasted batch on an uncertain outcome and keeps unattempted text", async () => {
    const onText = vi.fn().mockResolvedValueOnce({ kind: "partial", dispatchedCount: 1, refusedCount: 1, reason: "partial" });
    const h = harness(undefined, undefined, onText); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Student: Ada\nA\nStudent: Bob\nB" } });
    tree = h.confirmText(h.render()); h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); tree = h.render();
    expect(onText).toHaveBeenCalledTimes(1); expect(text(tree)).toContain("Needs review");
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission 2")!.props.value).toBe("Student: Bob\nB");
    expect(h.button(tree, "Grade reviewed submissions").props.disabled).toBe(true);
  });
  it("fences a pasted batch on session reset and never starts the next student", async () => {
    let finish!: (value: SubmitOutcome) => void; const onText = vi.fn(() => new Promise<SubmitOutcome>((resolve) => { finish = resolve; }));
    const h = harness(undefined, undefined, onText); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Student: Ada\nA\nStudent: Bob\nB" } });
    tree = h.confirmText(h.render()); h.button(tree, "Grade reviewed submissions").props.onClick(); h.reset(); tree = h.render(); finish({ kind: "accepted", entryCount: 1 }); await flush(); tree = h.render();
    expect(onText).toHaveBeenCalledTimes(1); expect(text(tree)).toContain("Needs review");
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission 2")!.props.value).toBe("Student: Bob\nB");
  });
  it("reviews and grades pasted students separately without retrying accepted work", async () => {
    const onText = vi.fn().mockResolvedValueOnce({ kind: "accepted", entryCount: 1 }).mockResolvedValueOnce({ kind: "refused", reason: "not ready" }).mockResolvedValueOnce({ kind: "accepted", entryCount: 1 });
    const h = harness(undefined, undefined, onText); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "Student: Ada\nFirst answer\nStudent: Bob\nSecond answer" } });
    tree = h.render(); expect(onText).not.toHaveBeenCalled(); expect(text(tree)).toContain("Review each name");
    tree = h.confirmText(tree); h.button(tree, "Grade reviewed submissions").props.onClick(); await flush(); tree = h.render();
    expect(onText.mock.calls).toEqual([["Ada", "Student: Ada\nFirst answer"], ["Bob", "Student: Bob\nSecond answer"]]); expect(text(tree)).toContain("Queued"); expect(text(tree)).toContain("not ready");
    h.button(tree, "Grade reviewed submissions").props.onClick(); await flush();
    expect(onText.mock.calls).toEqual([["Ada", "Student: Ada\nFirst answer"], ["Bob", "Student: Bob\nSecond answer"], ["Bob", "Student: Bob\nSecond answer"]]);
  });
  it("marks assigned files uncertain when the review callback rejects after dispatch", async () => {
    let fail!: (error: Error) => void;
    const onMany = vi.fn().mockResolvedValueOnce([{ kind: "identity", reason: "student needed" }]).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const h = harness(undefined, onMany, undefined, undefined, true); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    h.find(tree, "input").props.onChange({ target: { files: [work("assignment.pdf")], value: "x" } }); await flush(); tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student for assignment.pdf")!.props.onChange({ target: { value: "Ada" } });
    tree = h.render(); h.button(tree, "Grade assigned files").props.onClick();
    fail(new Error("lost response")); await flush(); tree = h.render();
    expect(text(tree)).toContain("Needs review");
    expect(text(tree)).toContain("Check results before retrying");
    expect(nodes(tree).some((n) => n.type === "Button" && text(n) === "Grade assigned files")).toBe(false);
    expect(onMany).toHaveBeenCalledTimes(2);
  });
  it("marks only the attempted group uncertain after reset, leaving other held files assignable", async () => {
    let finish!: (value: any) => void;
    const onOne = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const h = harness(onOne); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    h.find(tree, "input").props.onChange({ target: { files: [work("Alice_101_1_a.pdf"), work("Bob_102_1_b.pdf")], value: "x" } }); await flush(); tree = h.render();
    nodes(tree).find((n) => n.type === "Button" && text(n) === "Accept and grade this group")!.props.onClick();
    h.reset(); tree = h.render(); tree = h.render();
    const items = nodes(tree).filter((n) => n.type === "li");
    expect(items.find((n) => text(n).includes("Alice_101_1_a.pdf")) && text(items.find((n) => text(n).includes("Alice_101_1_a.pdf")))).toContain("Needs review");
    expect(items.find((n) => text(n).includes("Bob_102_1_b.pdf")) && text(items.find((n) => text(n).includes("Bob_102_1_b.pdf")))).toContain("Student needed");
    finish({ kind: "accepted", entryCount: 1 }); await flush();
  });
  it("shares a synchronous fence with other intake controls", async () => {
    const shared = { busy: true, generation: 0 }, onText = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 });
    const h = harness(undefined, undefined, onText, shared); let tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "work" } });
    tree = h.render(); h.button(tree, "Grade text").props.onClick();
    h.find(tree, "input").props.onChange({ target: { files: [work("one.pdf")], value: "x" } });
    expect(onText).not.toHaveBeenCalled(); expect(h.onOne).not.toHaveBeenCalled();
    shared.busy = false; h.button(tree, "Grade text").props.onClick(); expect(shared.busy).toBe(true);
    await flush(); expect(shared.busy).toBe(false); expect(onText).toHaveBeenCalledTimes(1);
  });
  it("submits named text separately in multiple-student mode and preserves refused text", async () => {
    const onText = vi.fn().mockResolvedValueOnce({ kind: "refused", reason: "setup incomplete" }).mockResolvedValueOnce({ kind: "accepted", entryCount: 1 });
    const h = harness(undefined, undefined, onText); let tree = h.render();
    h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    const field = (label: string) => nodes(tree).find((n) => n.type === "TextField" && n.props.label === label)!;
    field("Submission text").props.onChange({ target: { value: "Student work" } }); field("Student for this text").props.onChange({ target: { value: "Alice" } });
    tree = h.render(); h.button(tree, "Grade text").props.onClick(); await flush(); expect(onText).not.toHaveBeenCalled();
    nodes(tree).find((n) => n.type === "FormControlLabel" && n.props.label === "I checked this entire text belongs to the named student")!.props.control.props.onChange(null, true);
    tree = h.render(); h.button(tree, "Grade text").props.onClick(); await flush(); tree = h.render();
    expect(onText).toHaveBeenCalledWith("Alice", "Student work"); expect(field("Submission text").props.value).toBe("Student work"); expect(text(tree)).toContain("setup incomplete");
    h.button(tree, "Grade text").props.onClick(); await flush(); tree = h.render(); expect(field("Submission text").props.value).toBe("");
  });
  it("keeps text and requires a results check after a session change during submission", async () => {
    let finish!: (value: SubmitOutcome) => void; const onText = vi.fn(() => new Promise<SubmitOutcome>((resolve) => { finish = resolve; }));
    const h = harness(undefined, undefined, onText); let tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "work" } });
    tree = h.render(); h.button(tree, "Grade text").props.onClick(); h.reset(); finish({ kind: "accepted", entryCount: 1 }); await flush(); tree = h.render();
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.value).toBe("work");
    expect(h.button(tree, "Grade text").props.disabled).toBe(true); expect(text(tree)).toContain("Check the previous results");
  });
  it("retains uncertain text after an exception even if file activity clears the shared error", async () => {
    const onText = vi.fn().mockRejectedValue(new Error("network")); const h = harness(undefined, undefined, onText); let tree = h.render();
    nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.onChange({ target: { value: "work" } });
    tree = h.render(); h.button(tree, "Grade text").props.onClick(); await flush(); tree = h.render();
    h.find(tree, "input").props.onChange({ target: { files: [work("one.pdf")], value: "x" } }); await flush(); tree = h.render();
    expect(h.button(tree, "Grade text").props.disabled).toBe(true); expect(text(tree)).toContain("Check the previous results");
    expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Submission text")!.props.value).toBe("work");
  });
  it("holds multiple files, confirms the visible suggestion, and allows selecting the same file again", async () => {
    const h = harness(); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    const input = h.find(tree, "input"), first = work("Alice_101_1_a.pdf"); input.props.onChange({ target: { files: [first], value: "x" } }); await flush();
    tree = h.render(); expect(text(tree)).toContain("Alice_101_1_a.pdf"); expect(h.onOne).not.toHaveBeenCalled();
    h.button(tree, "Accept and grade this group").props.onClick(); await flush(); expect(h.onOne).toHaveBeenCalledTimes(1);
    tree = h.render(); h.find(tree, "input").props.onChange({ target: { files: [first], value: "x" } }); await flush(); tree = h.render();
    expect(text(tree).match(/Alice_101_1_a.pdf/g)!.length).toBeGreaterThan(1);
  });
  it("handles dropped refusal and partial results and changes queued rows after reset", async () => {
    const h = harness(vi.fn().mockResolvedValueOnce({ kind: "refused", reason: "too large" }).mockResolvedValueOnce({ kind: "partial", reason: "check results", dispatchedCount: 1, refusedCount: 1 }).mockResolvedValueOnce({ kind: "accepted", entryCount: 1 }));
    let tree = h.render(); const drop = () => h.find(tree, "Box");
    const area = () => nodes(tree).find((n) => typeof n.props?.onDrop === "function")!;
    const event = () => ({ preventDefault() {}, stopPropagation() {}, dataTransfer: { items: [], files: [work("one.pdf")] } });
    area().props.onDrop(event()); await flush(); tree = h.render(); expect(text(tree)).toContain("too large");
    h.button(tree, "Retry unsubmitted files").props.onClick(); await flush(); tree = h.render(); expect(text(tree)).toContain("Needs review");
    void drop;
    const h2 = harness(); slots.length = 0; tree = h2.render(); nodes(tree).find((n) => typeof n.props?.onDrop === "function")!.props.onDrop(event()); await flush(); tree = h2.render(); expect(text(tree)).toContain("Queued: 1 file"); expect(nodes(tree).find((n) => n.type === "AccordionSummary")).toBeDefined(); h2.reset(); tree = h2.render(); tree = h2.render(); expect(text(tree)).toContain("Needs review"); expect(text(tree)).not.toContain("Queued: 1 file");
  });
});
