/* eslint-disable @typescript-eslint/no-explicit-any -- JSX test shim inspects dynamic handlers. */
import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { dispatchComposite } from "./compositeSubmission";
import { claimIntake, releaseIntake, resetIntake } from "./intakeFence";

const slots: { value: any; deps?: unknown[] }[] = [];
let cursor = 0;
const useState = (initial: any) => { const slot = slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial }; return [slot.value, (next: any) => { slot.value = typeof next === "function" ? next(slot.value) : next; }]; };
const useRef = (initial: any) => (slots[cursor++] ??= { value: { current: initial } }).value;
const useEffect = (effect: () => unknown, deps: unknown[]) => { const slot = slots[cursor++] ??= { value: undefined }; if (!slot.deps || deps.some((value, index) => value !== slot.deps?.[index])) { slot.deps = deps; effect(); } };
const source = readFileSync("src/app/components/grading-chat/ChatComposer.tsx", "utf8");
const file = ts.createSourceFile("ChatComposer.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = file.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === "ChatComposer")!;
const code = ts.transpileModule(declaration.getText(file).replace(/^export\s+/, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const jsx = (type: string, props: any) => ({ type, props });
const names = ["TextField", "MenuItem", "Button", "Alert", "Accordion", "AccordionSummary", "AccordionDetails", "SubmissionDrop"];
const buildLms = vi.fn();
let capturedFrames: ((files: File[]) => void) | undefined;
const lms = { canSubmit: true, institution: "A", courseId: "1", assignmentId: "2", institutions: ["A"], courses: [{ id: "1", name: "Course" }], assignments: [{ id: "2", name: "Assignment" }], loading: {}, errors: {}, selectInstitution: vi.fn(), selectCourse: vi.fn(), selectAssignment: vi.fn() };
const factory = new Function("exports", "require", "useState", "useRef", "useEffect", "loadInputMode", "useLmsSubmissionPicker", "useChatScreenFrameCapture", "MAX_RECORDING_FRAMES", "loadComposerHeight", "persistComposerHeight", "persistInputMode", "describePart", "submitOnEnter", "dispatchComposite", "claimIntake", "releaseIntake", "resetIntake", "buildLmsAssignmentUrlAction", "lmsFieldIndication", "LMS_INSTITUTION_COPY", "LMS_COURSE_COPY", "LMS_ASSIGNMENT_COPY", "styles", "chatStyles", ...names, `${code}; return ChatComposer;`);
const component = factory({}, (id: string) => id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "Fragment" } : {}, useState, useRef, useEffect, () => "text", () => lms, (callback: (files: File[]) => void) => { capturedFrames = callback; return { recording: false, snapping: false }; }, 30, () => null, () => null, () => {}, (part: any) => part.content ?? part.file.name, () => () => {}, dispatchComposite, claimIntake, releaseIntake, resetIntake, buildLms, () => ({ disabled: false }), {}, {}, {}, {}, {}, ...names);
function nodes(value: any): any[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== "object") return []; return [value, ...nodes(value.props?.children)]; }
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => { slots.length = 0; cursor = 0; buildLms.mockReset(); capturedFrames = undefined; });
it("retains frames completed during intake and clears only submitted composite parts", async () => {
  let finish!: (result: any) => void;
  const submit = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const render = () => { cursor = 0; return component({ disabled: false, onSubmitFiles: vi.fn(), onSubmitUrl: vi.fn(), onSubmitComposite: submit, getSessionEpoch: () => 1 }); };
  let tree = render();
  nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Text for combined submission").props.onChange({ target: { value: "first" } });
  tree = render(); nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add text part").props.onClick();
  tree = render(); nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student name").props.onChange({ target: { value: "Ada" } });
  tree = render(); nodes(tree).find((n) => n.type === "Button" && n.props["aria-label"] === "Grade submission").props.onClick();
  capturedFrames!([{ name: "capture.png" } as File]);
  finish({ kind: "accepted", entryCount: 1 }); await flush(); tree = render();
  expect(nodes(tree).some((n) => n.type === "span" && n.props.children === "capture.png")).toBe(true);
  expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Student name").props.value).toBe("Ada");
  expect(nodes(tree).find((n) => n.type === "Button" && n.props["aria-label"] === "Grade submission").props.children).toBe("Grade submission (1)");
});
it("retains frames that finish after a session reset", () => {
  let epoch = 1;
  const render = () => { cursor = 0; return component({ disabled: false, sessionEpoch: epoch, onSubmitFiles: vi.fn(), onSubmitUrl: vi.fn(), onSubmitComposite: vi.fn(), getSessionEpoch: () => epoch }); };
  render(); const finishCapture = capturedFrames!;
  epoch++; render(); finishCapture([{ name: "after-reset.png" } as File]);
  const tree = render();
  expect(nodes(tree).some((n) => n.type === "span" && n.props.children === "after-reset.png")).toBe(true);
});
it("preserves all frames and blocks grading when they exceed the part limit", () => {
  const submit = vi.fn();
  const render = () => { cursor = 0; return component({ disabled: false, onSubmitFiles: vi.fn(), onSubmitUrl: vi.fn(), onSubmitComposite: submit, getSessionEpoch: () => 1 }); };
  render(); capturedFrames!(Array.from({ length: 31 }, (_, i) => ({ name: `frame-${i}.png` } as File)));
  const tree = render();
  const grade = nodes(tree).find((n) => n.type === "Button" && n.props["aria-label"] === "Grade submission");
  expect(grade.props.disabled).toBe(true); grade.props.onClick(); expect(submit).not.toHaveBeenCalled();
  expect(nodes(tree).some((n) => n.type === "Alert" && String(n.props.children).includes("too many parts"))).toBe(true);
  expect(nodes(tree).find((n) => n.type === "Button" && n.props["aria-label"] === "Remove part 31")).toBeDefined();
});
it("blocks same-turn add and remove while a deferred submission is pending", async () => {
  let finish!: (result: any) => void;
  const submit = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const render = () => { cursor = 0; return component({ disabled: false, onSubmitFiles: vi.fn(), onSubmitUrl: vi.fn(), onSubmitComposite: submit, getSessionEpoch: () => 1 }); };
  const button = (tree: any, label: string) => nodes(tree).find((n) => n.type === "Button" && n.props["aria-label"] === label);
  let tree = render();
  nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Text for combined submission").props.onChange({ target: { value: "first" } });
  tree = render(); nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add text part").props.onClick();
  tree = render();
  nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Text for combined submission").props.onChange({ target: { value: "second" } });
  tree = render();
  const grade = button(tree, "Grade submission"), remove = button(tree, "Remove part 1");
  const add = nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add text part");
  grade.props.onClick(); remove.props.onClick(); add.props.onClick();
  expect(submit).toHaveBeenCalledTimes(1);
  finish({ kind: "refused", reason: "retry" }); await flush(); tree = render();
  expect(button(tree, "Remove part 1")).toBeDefined();
  expect(button(tree, "Remove part 2")).toBeUndefined();
  expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Text for combined submission").props.value).toBe("second");
});

it("retains a refused URL, prevents duplicate dispatch, and clears it only on acceptance", async () => {
  let finish!: (result: any) => void;
  const submit = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const render = () => { cursor = 0; return component({ disabled: false, onSubmitFiles: vi.fn(), onSubmitUrl: submit, onSubmitComposite: vi.fn(), getSessionEpoch: () => 1 }); };
  const button = (tree: any, label: string) => nodes(tree).find((n) => n.type === "Button" && n.props.children === label);
  let tree = render(); button(tree, "Add link").props.onClick(); tree = render();
  nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Canvas, GitHub, or Google Drive URL").props.onChange({ target: { value: "https://example.test/work" } });
  tree = render(); const add = button(tree, "Add"); add.props.onClick(); add.props.onClick();
  expect(submit).toHaveBeenCalledTimes(1);
  finish({ kind: "refused", reason: "Not available" }); await flush(); tree = render();
  expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Canvas, GitHub, or Google Drive URL").props.value).toBe("https://example.test/work");
  button(tree, "Add").props.onClick(); finish({ kind: "accepted", entryCount: 2 }); await flush(); tree = render();
  expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Canvas, GitHub, or Google Drive URL").props.value).toBe("");
});

it("retains and locks a URL after a partial outcome or a session change", async () => {
  let epoch = 1, finish!: (result: any) => void;
  const submit = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const render = () => { cursor = 0; return component({ disabled: false, onSubmitFiles: vi.fn(), onSubmitUrl: submit, onSubmitComposite: vi.fn(), getSessionEpoch: () => epoch }); };
  const button = (tree: any, label: string) => nodes(tree).find((n) => n.type === "Button" && n.props.children === label);
  let tree = render(); button(tree, "Add link").props.onClick(); tree = render();
  nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Canvas, GitHub, or Google Drive URL").props.onChange({ target: { value: "https://example.test/work" } });
  tree = render(); button(tree, "Add").props.onClick(); epoch++; finish({ kind: "accepted", entryCount: 1 }); await flush(); tree = render();
  expect(button(tree, "Add").props.disabled).toBe(true);
  expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Canvas, GitHub, or Google Drive URL").props.value).toBe("https://example.test/work");
  const warning = nodes(tree).find((n) => n.type === "Alert" && String(n.props.children).includes("may have queued"));
  expect(warning).toBeDefined(); warning.props.action.props.onClick(); tree = render();
  button(tree, "Add").props.onClick(); finish({ kind: "partial", dispatchedCount: 1, refusedCount: 1, reason: "partial" }); await flush(); tree = render();
  expect(button(tree, "Add").props.disabled).toBe(true);
  expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Canvas, GitHub, or Google Drive URL").props.value).toBe("https://example.test/work");
});

it("retains the LMS selection and prevents duplicate dispatch on uncertain results", async () => {
  buildLms.mockResolvedValue({ url: "https://canvas.example/courses/1/assignments/2" });
  let finish!: (result: any) => void;
  const submit = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const render = () => { cursor = 0; return component({ disabled: false, onSubmitFiles: vi.fn(), onSubmitUrl: submit, onSubmitComposite: vi.fn(), getSessionEpoch: () => 1 }); };
  let tree = render(); nodes(tree).find((n) => n.type === "Button" && n.props.children === "From LMS").props.onClick(); tree = render();
  const grade = nodes(tree).find((n) => n.type === "Button" && n.props["aria-label"] === "Grade the picked LMS assignment");
  grade.props.onClick(); grade.props.onClick(); await flush(); expect(submit).toHaveBeenCalledTimes(1);
  finish({ kind: "partial", dispatchedCount: 1, refusedCount: 1, reason: "partial" }); await flush(); tree = render();
  expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Assignment").props.value).toBe("2");
  expect(nodes(tree).find((n) => n.type === "Button" && n.props["aria-label"] === "Grade the picked LMS assignment").props.disabled).toBe(true);
  expect(nodes(tree).some((n) => n.type === "Alert" && String(n.props.children).includes("may have queued"))).toBe(true);
});

it("shares the synchronous intake fence between file, URL and LMS controls", async () => {
  const sharedLatch = { busy: false, generation: 0 };
  const submit = vi.fn(() => new Promise(() => {}));
  const render = () => { cursor = 0; return component({ disabled: false, sharedLatch, onSubmitFiles: vi.fn(), onSubmitUrl: submit, onSubmitComposite: vi.fn(), getSessionEpoch: () => 1 }); };
  let tree = render(); nodes(tree).find((n) => n.type === "Button" && n.props.children === "From LMS").props.onClick(); tree = render();
  const oldLmsGrade = nodes(tree).find((n) => n.type === "Button" && n.props["aria-label"] === "Grade the picked LMS assignment");
  nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add link").props.onClick(); tree = render();
  nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Canvas, GitHub, or Google Drive URL").props.onChange({ target: { value: "https://example.test/work" } });
  tree = render();
  expect(nodes(tree).find((n) => n.type === "SubmissionDrop").props.sharedLatch).toBe(sharedLatch);
  sharedLatch.busy = true; nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add").props.onClick(); expect(submit).not.toHaveBeenCalled();
  sharedLatch.busy = false; nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add").props.onClick(); oldLmsGrade.props.onClick();
  await flush(); expect(submit).toHaveBeenCalledTimes(1); expect(buildLms).not.toHaveBeenCalled(); expect(sharedLatch.busy).toBe(true);
});

it("reset releases a hung URL without letting its late result unlock newer intake", async () => {
  const sharedLatch = { busy: false, generation: 0 }; let epoch = 1, finish!: (result: any) => void;
  const submit = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const render = () => { cursor = 0; return component({ disabled: false, sessionEpoch: epoch, sharedLatch, onSubmitFiles: vi.fn(), onSubmitUrl: submit, onSubmitComposite: vi.fn(), getSessionEpoch: () => epoch }); };
  let tree = render(); nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add link").props.onClick(); tree = render();
  nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Canvas, GitHub, or Google Drive URL").props.onChange({ target: { value: "https://example.test/work" } });
  tree = render(); nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add").props.onClick(); render();
  epoch++; resetIntake(sharedLatch); render(); tree = render();
  const current = claimIntake(sharedLatch)!; finish({ kind: "accepted", entryCount: 1 }); await flush(); tree = render();
  expect(sharedLatch.busy).toBe(true); expect(sharedLatch.generation).toBe(current);
  expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Canvas, GitHub, or Google Drive URL").props.value).toBe("https://example.test/work");
  expect(nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add").props.disabled).toBe(true);
  expect(releaseIntake(sharedLatch, current)).toBe(true);
});
