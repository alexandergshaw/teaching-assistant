// GRADING-CHAT wave 1 (docs/grading-chat-waves.md section 3, T5). Source-text
// canaries only - nothing renders under vitest here, so this file proves
// what the SOURCE contains, not what an instructor would see on screen.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const PANEL = "src/app/components/grading-chat/GradingChatPanel.tsx";
const COMPOSER = "src/app/components/grading-chat/ChatComposer.tsx";

describe("GradingChatPanel - RES-GC-11 disclosure floor", () => {
  it("renders the not-saved disclosure constant, not only defines it", () => {
    const source = read(PANEL);
    expect(source).toContain("CHAT_SESSION_NOT_SAVED_DISCLOSURE");
    // The constant must actually be rendered in JSX, not merely declared -
    // RED if the panel defines the string but never places it on screen.
    expect(source).toMatch(/\{CHAT_SESSION_NOT_SAVED_DISCLOSURE\}/);
  });

  it("the disclosure text names both a reload and a tab close as loss triggers", () => {
    const source = read(PANEL);
    const match = source.match(/CHAT_SESSION_NOT_SAVED_DISCLOSURE\s*=\s*\n?\s*"([^"]*)"/);
    expect(match, "expected to find the disclosure string literal").not.toBeNull();
    const text = match![1];
    expect(text.toLowerCase()).toContain("reload");
    expect(text.toLowerCase()).toMatch(/closing this tab|close/);
  });
});

describe("ChatComposer - RES-GC-UX-3 Send focus retention", () => {
  it("the Send handler calls .focus() on the composer text field after clearing it", () => {
    const source = read(COMPOSER);
    const sendIndex = source.indexOf("const handleSendText");
    expect(sendIndex, "expected to find handleSendText in ChatComposer.tsx").toBeGreaterThan(-1);
    const handlerEnd = source.indexOf("};", sendIndex);
    const handlerBody = source.slice(sendIndex, handlerEnd);
    expect(handlerBody).toContain("setText(\"\")");
    expect(handlerBody).toMatch(/textFieldRef\.current\?\.focus\(\)/);
  });
});

describe("ChatComposer - slotProps.input vs top-level onKeyDown split (UX doc section 3.2)", () => {
  it("the multiline text-mode field carries onKeyDown inside slotProps.input, not htmlInput", () => {
    const source = read(COMPOSER);
    expect(source).toMatch(/slotProps=\{\{\s*input:\s*\{\s*onKeyDown:/);
  });

  it("the single-line URL field uses a top-level onKeyDown prop, copying the Canvas-URL precedent", () => {
    const source = read(COMPOSER);
    const urlFieldIndex = source.indexOf('type="url"');
    expect(urlFieldIndex).toBeGreaterThan(-1);
    const fieldEnd = source.indexOf("/>", urlFieldIndex);
    const fieldMarkup = source.slice(urlFieldIndex, fieldEnd);
    expect(fieldMarkup).toContain("onKeyDown={submitOnEnter(handleSendUrl)}");
  });
});

describe("GradingChatPanel - reused house classes, no new inline flex", () => {
  it("keeps styles.form; the setup fields drop styles.field for chatStyles.compactField (competing 220px selector gone)", () => {
    const source = read(PANEL);
    expect(source).toContain("styles.form");
    expect(source).not.toContain("styles.field");
    expect(source).toContain("chatStyles.compactField");
  });

  it("append-vs-reset: the results table is fed the driver's growing run, never a locally reset one", () => {
    const source = read(PANEL);
    expect(source).toContain("driver.run");
    expect(source).not.toContain("setDriverRun");
  });
});

describe("GradingChatPanel - fields lock once the session is ready (verify doc attack 9 fix)", () => {
  it("derives sessionReady from headerState === \"ready\"", () => {
    const source = read(PANEL);
    expect(source).toMatch(/sessionReady\s*=\s*driver\.headerState\s*===\s*"ready"/);
  });

  it("the Instructions field is bound to sessionReady's disabled prop", () => {
    const source = read(PANEL);
    const idx = source.indexOf('id="grading-chat-instructions"');
    expect(idx).toBeGreaterThan(-1);
    const fieldEnd = source.indexOf("/>", idx);
    const fieldMarkup = source.slice(idx, fieldEnd);
    expect(fieldMarkup).toContain("disabled={sessionReady}");
  });

  it("the Rubric field is bound to sessionReady's disabled prop", () => {
    const source = read(PANEL);
    const idx = source.indexOf('id="grading-chat-rubric"');
    expect(idx).toBeGreaterThan(-1);
    const fieldEnd = source.indexOf("/>", idx);
    const fieldMarkup = source.slice(idx, fieldEnd);
    expect(fieldMarkup).toContain("disabled={sessionReady}");
  });
});

describe("GradingChatPanel - New session control wires the previously-dead driver.reset() (RESIDUAL A fix)", () => {
  it("a New session control's handler calls driver.reset()", () => {
    const source = read(PANEL);
    const idx = source.indexOf("const handleNewSession");
    expect(idx, "expected to find handleNewSession in GradingChatPanel.tsx").toBeGreaterThan(-1);
    const handlerEnd = source.indexOf("};", idx);
    const handlerBody = source.slice(idx, handlerEnd);
    expect(handlerBody).toContain("driver.reset()");
  });

  it("the New session handler confirms before discarding the run (repo standard: keep confirm on a destructive action)", () => {
    const source = read(PANEL);
    const idx = source.indexOf("const handleNewSession");
    const handlerEnd = source.indexOf("};", idx);
    const handlerBody = source.slice(idx, handlerEnd);
    expect(handlerBody).toContain("window.confirm(");
    expect(handlerBody.indexOf("window.confirm(")).toBeLessThan(handlerBody.indexOf("driver.reset()"));
  });

  it("a Button element is wired to handleNewSession", () => {
    const source = read(PANEL);
    expect(source).toMatch(/onClick=\{handleNewSession\}/);
  });
});

// GRADER W2 (docs/grader-w2-test-notes.md O1/O2/O3-panel/O4-half-2). Source-text
// canaries: they prove the panel HANDS the driver values on, not on-screen
// behaviour (nothing renders under vitest; the live walk is OWNER).
function withoutLineComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n\r]*/g, "");
}

function resultsMountSlice(source: string): string {
  const start = source.indexOf("<GradingResults");
  expect(start, "expected a <GradingResults mount").toBeGreaterThan(-1);
  const end = source.indexOf("/>", start);
  return source.slice(start, end);
}

describe("GradingChatPanel - W2 O1: canvasUrl and runKey come from the driver", () => {
  it("does not hardcode an empty canvasUrl", () => {
    expect(withoutLineComments(read(PANEL))).not.toMatch(/canvasUrl\s*=\s*(""|\{""\}|\{''\}|'')/);
  });

  it("feeds canvasUrl from driver.canvasUrl on the GradingResults mount", () => {
    const source = withoutLineComments(read(PANEL));
    expect(source).toContain("driver.canvasUrl");
    expect(resultsMountSlice(source)).toMatch(/canvasUrl=\{\s*driver\.canvasUrl\s*\}/);
  });

  it("feeds runKey from driver.runKey on the GradingResults mount", () => {
    const source = withoutLineComments(read(PANEL));
    expect(source).toContain("driver.runKey");
    expect(resultsMountSlice(source)).toMatch(/\brunKey=\{\s*driver\.runKey\s*\}/);
  });
});

describe("GradingChatPanel - W2 O2: provenance components are imported AND rendered from driver values", () => {
  it("imports both components from the grading-results directory", () => {
    const source = withoutLineComments(read(PANEL));
    expect(source).toMatch(/import\s+RubricProvenance\s+from\s+"\.\.\/grading-results\/RubricProvenance"/);
    expect(source).toMatch(/import\s+GeneratedRubricCard\s+from\s+"\.\.\/grading-results\/GeneratedRubricCard"/);
  });

  it("renders RubricProvenance with run={driver.run}", () => {
    expect(withoutLineComments(read(PANEL))).toMatch(/<RubricProvenance\s+run=\{\s*driver\.run\s*\}/);
  });

  it("renders GeneratedRubricCard with generatedRubric={driver.generatedRubric}", () => {
    expect(withoutLineComments(read(PANEL))).toMatch(/<GeneratedRubricCard\s+generatedRubric=\{\s*driver\.generatedRubric\s*\}/);
  });
});

describe("GradingChatPanel - W2 O4 half 2: the edits key is session-scoped", () => {
  it("feeds editsSurface from driver.runKey, not a constant", () => {
    const slice = resultsMountSlice(withoutLineComments(read(PANEL)));
    expect(slice).toMatch(/editsSurface=\{\s*driver\.runKey\s*\}/);
    expect(slice).not.toMatch(/editsSurface="grading-chat"/);
  });
});

describe("GradingChatPanel - regrade-after-batch: the chat mount opts in, the other mounts do not", () => {
  const RESULTS = "src/app/components/GradingResults.tsx";

  it("passes onRegrade={driver.regrade} on the GradingResults mount", () => {
    const slice = resultsMountSlice(withoutLineComments(read(PANEL)));
    expect(slice).toMatch(/\bonRegrade=\{\s*driver\.regrade\s*\}/);
  });

  it("passes unresolvedStudents={driver.unresolvedStudents} to the results mount", () => {
    const source = withoutLineComments(read(PANEL));
    expect(resultsMountSlice(source)).toMatch(/unresolvedStudents=\{\s*driver\.unresolvedStudents\s*\}/);
  });

  it("the non-chat mounts pass no unresolvedStudents", () => {
    for (const file of [
      "src/app/components/GithubGradingPanel.tsx",
      "src/app/components/GradingTab.tsx",
      "src/app/components/LiveFeedPanel.tsx",
    ]) {
      expect(resultsMountSlice(withoutLineComments(read(file)))).not.toContain("unresolvedStudents");
    }
  });

  it("GradingResults threads unresolvedStudents into StudentNameCell, which renders the flag leaf", () => {
    const results = withoutLineComments(read(RESULTS));
    expect(results).toMatch(/unresolved=\{\s*unresolvedStudents\?\.has\(result\.student\)/);
    const cell = withoutLineComments(read("src/app/components/grading-results/StudentNameCell.tsx"));
    expect(cell).toContain("describeUnresolvedNameLabel()");
  });

  it("the non-chat mounts pass no onRegrade", () => {
    for (const file of [
      "src/app/components/GithubGradingPanel.tsx",
      "src/app/components/GradingTab.tsx",
      "src/app/components/LiveFeedPanel.tsx",
    ]) {
      expect(resultsMountSlice(withoutLineComments(read(file)))).not.toContain("onRegrade");
    }
  });

  it("GradingResults renders the Regrade button only under an onRegrade guard", () => {
    const source = withoutLineComments(read(RESULTS));
    expect(source).toMatch(/\{onRegrade\s*&&\s*\([\s\S]{0,400}<RegradeButton[\s\S]{0,200}handleRegradeRow\(result\.student\)/);
    // The button itself shows a busy state and is disabled while the row is in flight.
    const button = withoutLineComments(read("src/app/components/grading-results/RegradeButton.tsx"));
    expect(button).toContain("disabled={busy}");
    expect(button).toContain("Regrading...");
    expect(source).toMatch(/busy=\{regradingStudents\?\.has\(result\.student\)/);
  });

  it("the Regrade handler clears edits[student] and the post status, then calls onRegrade", () => {
    const source = withoutLineComments(read(RESULTS));
    const start = source.indexOf("const handleRegradeRow");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("onRegrade?.(student)", start) + 25);
    expect(body).toMatch(/setEdits\(/);
    expect(body).toMatch(/delete next\[student\]/);
    expect(body).toMatch(/clearPostStatus\(student\)/);
    expect(body).toContain("onRegrade?.(student)");
  });

  it("the guard pattern discriminates: an unguarded button and a non-clearing handler do not match", () => {
    const guarded = /\{onRegrade\s*&&\s*\([\s\S]{0,400}handleRegradeRow\(result\.student\)/;
    expect("<Button onClick={() => handleRegradeRow(result.student)}>Regrade</Button>").not.toMatch(guarded);
    expect("{onRegrade && (<Button onClick={() => handleRegradeRow(result.student)}>").toMatch(guarded);
    expect("const handleRegradeRow = (s) => { onRegrade?.(s); };").not.toMatch(/delete next\[student\]/);
  });
});

describe("GradingChatPanel - W2 O3 panel-feed: the driver is constructed with commentSplit: true", () => {
  it("the useContinuousGradingRun( construction call carries commentSplit: true", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf("useContinuousGradingRun(");
    expect(start, "expected the driver construction call").toBeGreaterThan(-1);
    const end = source.indexOf(");", start);
    expect(source.slice(start, end)).toMatch(/commentSplit\s*:\s*true/);
  });
});

// GRADER W2 wiring guard (docs/grader-w2-wiring-test-notes.md, SMOOTH-GRADER).
// Source-text pins on the session-setup block; the runtime await chain is a
// reading claim (OWNER live walk), not asserted here.
function ensureSessionBlock(): string {
  const source = withoutLineComments(read(PANEL));
  const start = source.indexOf("const ensureSession = async");
  const end = source.indexOf("const handleSubmitText");
  expect(start, "expected the ensureSession declaration").toBeGreaterThan(-1);
  expect(end, "expected the handleSubmitText declaration").toBeGreaterThan(-1);
  const legacyStart = source.indexOf("const scope = canvasUrl", start);
  expect(legacyStart, "expected the unchanged Canvas/draft setup branch after explicit role setup").toBeGreaterThan(start);
  return source.slice(legacyStart, end);
}

describe("GradingChatPanel - W2 AR1: the Canvas fetch is awaited before beginSession", () => {
  it("an awaited fetchCanvasMetaAction( call precedes driver.beginSession(", () => {
    const block = ensureSessionBlock();
    const fetchIdx = block.indexOf("await fetchCanvasMetaAction(");
    const beginIdx = block.indexOf("driver.beginSession(");
    expect(fetchIdx, "expected an awaited Canvas meta fetch").toBeGreaterThan(-1);
    expect(beginIdx, "expected the beginSession call").toBeGreaterThan(-1);
    expect(fetchIdx).toBeLessThan(beginIdx);
  });
});

describe("GradingChatPanel - W2 AR1b: beginSession is fed the resolved (override-composed) values", () => {
  it("passes resolved.instructions and resolved.rubric, not the stale state vars", () => {
    const block = ensureSessionBlock();
    const beginStart = block.indexOf("driver.beginSession(");
    expect(beginStart, "expected the beginSession call").toBeGreaterThan(-1);
    const beginEnd = block.indexOf("});", beginStart);
    expect(beginEnd, "expected the beginSession call terminator").toBeGreaterThan(-1);
    const beginBlock = block.slice(beginStart, beginEnd);
    expect(beginBlock).toMatch(/assignmentInstructions:\s*resolved\.instructions\b/);
    expect(beginBlock).toMatch(/\brubric:\s*resolved\.rubric\b/);
  });
});

describe("GradingChatPanel - W2 AR1c: the Canvas fetch is gated by canvasUrl && scope only (LMS-META-OVERRIDE-OFFER)", () => {
  it("fetchCanvasMetaAction lives inside the if (canvasUrl && scope) block, not behind needsFill", () => {
    const block = ensureSessionBlock();
    const guardIdx = block.indexOf("if (canvasUrl && scope) {");
    expect(guardIdx, "expected the canvasUrl && scope guard").toBeGreaterThan(-1);
    expect(block).not.toContain("canvasUrl && scope && needsFill");
    const loadedIdx = block.indexOf("const loaded =", guardIdx);
    expect(loadedIdx, "expected the statement after the guard").toBeGreaterThan(-1);
    expect(block.slice(guardIdx, loadedIdx)).toContain("fetchCanvasMetaAction");
  });
});

describe("GradingChatPanel - LMS-META-OVERRIDE-OFFER wiring (reachability pins)", () => {
  it("composes the override over the fill result, offers via window.confirm, and applies before beginSession", () => {
    const block = ensureSessionBlock();
    expect(block).toMatch(/computeOverrideOffer\(\{\s*typed:\s*\{\s*instructions,\s*rubric\s*\},\s*canvasMeta\s*\}\)/);
    expect(block).toMatch(/applyOverride\(\{\s*base:\s*fill,/);
    const confirmIdx = block.indexOf("window.confirm(");
    const applyIdx = block.indexOf("applyOverride(");
    const setInsIdx = block.indexOf("setInstructions(resolved.instructions)");
    const setRubIdx = block.indexOf("setRubric(resolved.rubric)");
    const beginIdx = block.indexOf("driver.beginSession(");
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(confirmIdx).toBeLessThan(applyIdx);
    expect(applyIdx).toBeLessThan(setInsIdx);
    expect(applyIdx).toBeLessThan(setRubIdx);
    expect(setInsIdx).toBeLessThan(beginIdx);
  });

  it("persists the resolved values and the note reads the resolved sources", () => {
    const block = ensureSessionBlock();
    expect(block).toMatch(/saveChatSetupMemory\(scope,\s*\{\s*rubric:\s*resolved\.rubric,\s*instructions:\s*resolved\.instructions\s*\}\)/);
    expect(block).toMatch(/resolved\.instructionsSource === "canvas" \|\| resolved\.rubricSource === "canvas"/);
    expect(block).not.toMatch(/fill\.(instructions|rubric)Source/);
  });

  it("records the override diagnostic through recordGradingDiagnosticEntry with no student text", () => {
    const block = ensureSessionBlock();
    const recordIdx = block.indexOf("recordGradingDiagnosticEntry(");
    expect(recordIdx).toBeGreaterThan(-1);
    const call = block.slice(recordIdx, block.indexOf("});", recordIdx));
    expect(call).toContain('operation: "override_setup_fields"');
    expect(call).not.toMatch(/error:|institution:|course:/);
  });

  it("the offer is computed only in ensureSession, which the Canvas URL submit reaches", () => {
    const source = withoutLineComments(read(PANEL));
    expect(source.split("computeOverrideOffer(").length - 1).toBe(1);
    expect(source).toMatch(/ensureSession\(url\)/);
  });
});

// GRADER W3 surface (docs/grader-w3-surface-test-notes.md, SMOOTH-GRADER).
// Source-text and CSS-structure pins: they prove the mechanism is PRESENT in the
// source, never that the composer sticks or a field is shorter on screen (owner
// walk, residuals RG3-1..RG3-8).
const CHAT_MODULE = "src/app/components/grading-chat/grading-chat.module.css";

function withoutCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function ruleBlock(css: string, selector: string): string {
  const sel = css.indexOf(selector);
  expect(sel, `expected a ${selector} rule`).toBeGreaterThan(-1);
  const open = css.indexOf("{", sel);
  const close = css.indexOf("}", open);
  expect(open, `expected an opening brace for ${selector}`).toBeGreaterThan(-1);
  expect(close, `expected a closing brace for ${selector}`).toBeGreaterThan(open);
  return css.slice(open + 1, close);
}

describe("GradingChatPanel - W3 F1: the composer sits in a sticky wrapper", () => {
  it("the ChatComposer mount is enclosed by chatStyles.stickyComposer within a bounded window", () => {
    const source = withoutLineComments(read(PANEL));
    const mountIdx = source.indexOf("<ChatComposer");
    expect(mountIdx, "expected the ChatComposer mount").toBeGreaterThan(-1);
    const classIdx = source.lastIndexOf("chatStyles.stickyComposer", mountIdx);
    expect(classIdx, "expected chatStyles.stickyComposer before the mount").toBeGreaterThan(-1);
    // Window widened 1000 -> 1500: the latest-result card, the submitError
    // notice, and the prominent spinner loading block (styles.loadingState,
    // made apparent on owner request 2026-10-08) all sit between the sticky
    // wrapper and the composer mount. Still bounds the composer to the wrapper.
    expect(mountIdx - classIdx).toBeLessThan(1500);
  });

  it("the .stickyComposer rule has position: sticky and a bottom/top offset (mechanism proxy; sticking itself is an owner walk check)", () => {
    const block = ruleBlock(withoutCssComments(read(CHAT_MODULE)), ".stickyComposer");
    expect(block).toMatch(/position:\s*sticky/);
    expect(block).toMatch(/(^|[\s;{])(bottom|top):\s*[^;]+/);
  });
});

describe("GradingChatPanel - W3 F2: the setup fields collapse to a summary once the session is ready", () => {
  it("a sessionReady guard precedes both setup field ids and a chatStyles.setupSummary element exists", () => {
    const source = withoutLineComments(read(PANEL));
    const guard = source.search(/!sessionReady|sessionReady\s*\?/);
    const instr = source.indexOf('id="grading-chat-instructions"');
    const rubricIdx = source.indexOf('id="grading-chat-rubric"');
    expect(guard, "expected a sessionReady guard").toBeGreaterThan(-1);
    expect(instr).toBeGreaterThan(-1);
    expect(rubricIdx).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(instr);
    expect(guard).toBeLessThan(rubricIdx);
    expect(source).toContain("chatStyles.setupSummary");
  });
});

describe("GradingChatPanel - W3 F3: compact setup fields", () => {
  for (const id of ['id="grading-chat-instructions"', 'id="grading-chat-rubric"']) {
    it(`the wrapper of ${id} carries chatStyles.compactField and not styles.field`, () => {
      const source = withoutLineComments(read(PANEL));
      const idIdx = source.indexOf(id);
      expect(idIdx).toBeGreaterThan(-1);
      const divIdx = source.lastIndexOf("<div", idIdx);
      expect(divIdx).toBeGreaterThan(-1);
      expect(divIdx).toBeLessThan(idIdx);
      const wrapperOpen = source.slice(divIdx, idIdx);
      expect(wrapperOpen).toContain("chatStyles.compactField");
      expect(wrapperOpen).not.toContain("styles.field");
    });
  }

  it("the .compactField rule sets a textarea min-height strictly below 220px", () => {
    const css = withoutCssComments(read(CHAT_MODULE));
    const sel = css.indexOf(".compactField textarea");
    expect(sel, "expected a .compactField textarea rule").toBeGreaterThan(-1);
    const block = ruleBlock(css.slice(sel), ".compactField textarea");
    const match = block.match(/min-height:\s*(\d+)px/);
    expect(match, "expected a px min-height").not.toBeNull();
    expect(Number(match![1])).toBeLessThan(220);
  });
});

describe("GradingChatPanel - responsive intake: the error stays in normal flow below results", () => {
  it("submitError role=alert is inside chatStyles.auxiliary and after the results mount", () => {
    const source = withoutLineComments(read(PANEL));
    const wrapperOpen = source.indexOf("chatStyles.auxiliary");
    const mountIdx = source.indexOf("<ChatComposer");
    const alertIdx = source.indexOf('role="alert"');
    const resultsIdx = source.indexOf("<GradingResults");
    expect(wrapperOpen).toBeGreaterThan(-1);
    expect(mountIdx).toBeGreaterThan(-1);
    expect(alertIdx).toBeGreaterThan(-1);
    expect(resultsIdx).toBeGreaterThan(-1);
    expect(alertIdx).toBeGreaterThan(wrapperOpen);
    expect(alertIdx).toBeLessThan(mountIdx);
    expect(alertIdx).toBeGreaterThan(resultsIdx);
  });
});

describe("ChatComposer - W3 F5: Send stays grouped with the Submission text field", () => {
  it("the Send IconButton sits inside the text-mode adaptRow that holds the Submission text field", () => {
    const source = withoutLineComments(read(COMPOSER));
    const labelIdx = source.indexOf('label="Submission text"');
    expect(labelIdx).toBeGreaterThan(-1);
    const rowOpen = source.lastIndexOf("chatStyles.composerRow", labelIdx);
    expect(rowOpen).toBeGreaterThan(-1);
    const rowClose = source.indexOf("</div>", labelIdx);
    expect(rowClose).toBeGreaterThan(labelIdx);
    const slice = source.slice(rowOpen, rowClose);
    expect(slice).toContain('aria-label="Send submission"');
  });
});

describe("GradingChatPanel - RG-CLEANUP: no stale legacy seed on the non-Canvas path", () => {
  it("does not read localStorage to seed the setup fields", () => {
    const source = read(PANEL);
    expect(source).not.toContain("loadPersisted");
    expect(source).not.toContain("INSTRUCTIONS_STORAGE_KEY");
    expect(source).not.toContain("RUBRIC_STORAGE_KEY");
    // The only localStorage reads are the harshness, feedback-length and
    // file-name-deduction preferences; neither seeds the instructions or rubric fields.
    const reads = source.match(/localStorage\.getItem\([^)]*\)/g) ?? [];
    expect(reads).toEqual([
      "localStorage.getItem(HARSHNESS_STORAGE_KEY)",
      "localStorage.getItem(FEEDBACK_LENGTH_STORAGE_KEY)",
      "localStorage.getItem(APPLY_NAMING_DEDUCTION_STORAGE_KEY)",
      "localStorage.getItem(APPLY_LENGTH_DEDUCTION_STORAGE_KEY)",
    ]);
  });

  it("the Canvas-scoped memory still restores inside ensureSession", () => {
    const source = read(PANEL);
    expect(source).toContain("loadChatSetupMemory(scope)");
    expect(source).toContain("saveChatSetupMemory(scope");
  });
});

// COMPOSITE W2 (docs/grading-chat-composite-scope.md section 7). Source-text
// pins on the parts tray; the interaction itself is an OWNER walk.
describe("GradingChatPanel - composite W2: tray wiring", () => {
  it("the panel hands ChatComposer onSubmitComposite and keeps the three single-part props", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf("<ChatComposer");
    expect(start).toBeGreaterThan(-1);
    const mount = source.slice(start, source.indexOf("/>", start));
    expect(mount).toMatch(/onSubmitComposite=\{handleSubmitComposite\}/);
    expect(mount).toMatch(/onSubmitText=\{handleSubmitText\}/);
    expect(mount).toMatch(/onSubmitFiles=\{handleSubmitFiles\}/);
    expect(mount).toMatch(/onSubmitUrl=\{handleSubmitUrl\}/);
  });

  it("handleSubmitComposite ensures a session, then submits a composite through the driver", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf("const handleSubmitComposite");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("const busy", start));
    expect(body).toContain("await ensureSession()");
    expect(body).toMatch(/driver\.submit\(\{\s*kind:\s*"composite",\s*student,\s*parts\s*\}\)/);
    expect(body.indexOf("ensureSession()")).toBeLessThan(body.indexOf("driver.submit("));
  });
});

describe("ChatComposer - composite W2: tray controls and the preserved single-part path", () => {
  it("declares onSubmitComposite and the three single-part callbacks", () => {
    const source = withoutLineComments(read(COMPOSER));
    expect(source).toMatch(/onSubmitComposite:\s*\(student: string, parts: CompositePartInput\[\]\) => void/);
    expect(source).toMatch(/onSubmitText:/);
    expect(source).toMatch(/onSubmitFiles:/);
    expect(source).toMatch(/onSubmitUrl:/);
  });

  it("has the add-part, remove, student-name and grade controls", () => {
    const source = withoutLineComments(read(COMPOSER));
    expect(source).toContain("+ Add part");
    expect(source).toMatch(/Remove part/);
    expect(source).toContain('label="Student name"');
    expect(source).toMatch(/Grade submission \(\$\{parts\.length\}\)/);
    expect(source).toMatch(/onSubmitComposite\(student\.trim\(\), parts\)/);
  });

  it("each mode's primary handler still reaches its immediate-submit callback when the tray is empty, and reroutes to add-part when it is not", () => {
    const source = withoutLineComments(read(COMPOSER));
    const slice = (from: string, to: string) => {
      const a = source.indexOf(from);
      expect(a, from).toBeGreaterThan(-1);
      return source.slice(a, source.indexOf(to, a));
    };
    const text = slice("const handleSendText", "const handleAddTextPart");
    expect(text).toContain("onSubmitText(");
    expect(text.indexOf("trayActive")).toBeGreaterThan(-1);
    expect(text.indexOf("handleAddTextPart()")).toBeLessThan(text.indexOf("onSubmitText("));
    const url = slice("const handleSendUrl", "const handleAddUrlPart");
    expect(url).toContain("onSubmitUrl(");
    expect(url.indexOf("handleAddUrlPart()")).toBeLessThan(url.indexOf("onSubmitUrl("));
    const pick = slice("const handlePickFile", "const handleSendUrl");
    expect(pick).toContain("onSubmitFiles(files, ");
    expect(pick).toContain("trayActive");
  });
});

describe("submission labels: file and url modes carry the optional label", () => {
  it("the composer declares a label field in file mode and in url mode, and threads it into the callbacks", () => {
    const source = withoutLineComments(read(COMPOSER));
    expect(source).toMatch(/onSubmitFiles:\s*\(files: File\[\], label\?: string\) => void/);
    expect(source).toMatch(/onSubmitUrl:\s*\(url: string, label\?: string\) => void/);
    const fileBlock = source.slice(source.indexOf('mode === "file" && ('), source.indexOf("+ Add part"));
    expect(fileBlock).toContain("chatStyles.composerLabel");
    expect(fileBlock).toContain("Label (optional)");
    const urlBlock = source.slice(source.indexOf('mode === "url" && ('));
    expect(urlBlock).toContain("chatStyles.composerLabel");
    expect(urlBlock).toContain("Label (optional)");
    expect(source).toContain("onSubmitUrl(url.trim(), ");
  });

  it("the panel forwards the label to the driver only for a single-file pick", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf("const handleConfirmedFiles");
    const files = source.slice(start, source.indexOf("const handleSubmitUrl"));
    expect(files).toMatch(/files\.length === 1 \? label : undefined/);
    expect(files).toContain('kind: "file", file, label: fileLabel');
    const url = source.slice(source.indexOf("const handleSubmitUrl"), source.indexOf("const handleSubmitComposite"));
    expect(url).toContain('kind: "url", url, label');
    // The whole-view drop supplies no label.
    expect(source).toContain("handleSubmitFiles(files);");
  });
});

// GRADING-CHAT-CONTROLS (docs/grading-chat-controls-scope.md items 1-4). Source
// pins on wiring; the rendered effect and the clipboard are OWNER walks.
const DRIVER = "src/app/components/grading-chat/useContinuousGradingRun.ts";

describe("GradingChatPanel - controls #1: clear controls", () => {
  it("each setup field has a clear handler inside the !sessionReady branch", () => {
    const source = withoutLineComments(read(PANEL));
    const guard = source.indexOf("!sessionReady ? (");
    const summary = source.indexOf("chatStyles.setupSummary");
    expect(guard).toBeGreaterThan(-1);
    const branch = source.slice(guard, summary);
    expect(branch).toContain("onClick={handleClearInstructions}");
    expect(branch).toContain("onClick={handleClearRubric}");
    expect(source).toMatch(/handleClearInstructions\s*=\s*\(\)\s*=>\s*setInstructions\(""\)/);
    expect(source).toMatch(/handleClearRubric\s*=\s*\(\)\s*=>\s*setRubric\(""\)/);
  });

  it("Clear all clears both fields and is shown only pre-lock", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf("const handleClearAll");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("};", start));
    expect(body).toContain('setInstructions("")');
    expect(body).toContain('setRubric("")');
    expect(source).toMatch(/!sessionReady\s*&&\s*\(instructions\s*!==\s*""\s*\|\|\s*rubric\s*!==\s*""\s*\|\|\s*lengthThresholdText/);
    expect(body).toContain("changeLengthThreshold(String(LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT))");
    expect(source).toContain("onClick={handleClearAll}");
  });

  it("the composer text field has a Clear control that empties the text", () => {
    const source = withoutLineComments(read(COMPOSER));
    expect(source).toContain('aria-label="Clear submission text"');
    const start = source.indexOf("const handleClearText");
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, source.indexOf("};", start))).toContain('setText("")');
    expect(source).toContain("onClick={handleClearText}");
  });
});

describe("GradingChatPanel - controls #4: loading indicators", () => {
  it("legacy non-file submits run inside withPreparing and a role preview also disables the composer", () => {
    const source = withoutLineComments(read(PANEL));
    for (const name of ["handleSubmitText", "handleSubmitUrl", "handleSubmitComposite"]) {
      const start = source.indexOf(`const ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      expect(source.slice(start, start + 200), name).toContain("withPreparing(");
    }
    expect(source).toMatch(/finally\s*\{\s*setPreparing\(false\)/);
    expect(source).toMatch(/<ChatComposer\s+disabled=\{busy\s*\|\|\s*preparing\s*\|\|\s*roleIntake\.pending\}/);
  });

  it("the grading indicator is driven by OUTSTANDING work (dispatched - completed), not driver.inFlight", () => {
    // Regression: keying the indicator on driver.inFlight (active concurrency
    // slots only) made it vanish while grading was still going - inFlight hits
    // 0 in the gap between intake and dispatch and whenever work is queued
    // behind the concurrency limit. The indicator must key on work outstanding.
    const source = withoutLineComments(read(PANEL));
    expect(source).toContain("driver.dispatchedCount - driver.completedCount");
    expect(source).toMatch(/pendingCount:\s*Math\.max\(driver\.pendingStudents\.size/);
    expect(source).toMatch(/regradingStudents=\{driver\.pendingStudents\}/);
    // and it must NOT regress to gating the block on inFlight
    expect(source).not.toMatch(/driver\.inFlight\s*>\s*0/);
  });
});

describe("GradingChatPanel - controls #3: harshness control and wire", () => {
  it("renders a SegmentedToggle with Lenient / Balanced / Strict, locked after the session starts", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf('label="Grading strictness"');
    expect(start).toBeGreaterThan(-1);
    const toggle = source.slice(start, source.indexOf("/>", start));
    for (const v of ["lenient", "balanced", "strict"]) expect(toggle).toContain(`value: "${v}"`);
    expect(toggle).toContain("disabled={sessionReady}");
  });

  it("persists under the harshness key and defaults to balanced", () => {
    const source = withoutLineComments(read(PANEL));
    expect(source).toContain('HARSHNESS_STORAGE_KEY = "ta-grading-chat-harshness"');
    expect(source).toContain("localStorage.setItem(HARSHNESS_STORAGE_KEY");
    expect(source).toMatch(/useState<GradeHarshness>\("balanced"\)/);
  });

  it("captures harshness at beginSession (not per submit)", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.lastIndexOf("driver.beginSession(");
    const call = source.slice(start, source.indexOf("});", start));
    expect(call).toMatch(/\bharshness\b/);
    const driver = withoutLineComments(read(DRIVER));
    expect(driver).toMatch(/harshnessRef\.current\s*=\s*sessionParams\.harshness\s*\?\?\s*"balanced"/);
  });

  it("the driver conditional-spreads harshness into the request body, default wire byte-identical", () => {
    const driver = withoutLineComments(read(DRIVER));
    expect(driver).toContain('...(harshnessRef.current !== "balanced" ? { harshness: harshnessRef.current } : {})');
    // Default-wire canary: no unconditional harshness key on the body.
    expect(driver).not.toMatch(/^\s*harshness(:|,)/m);
  });
});

describe("GradingChatPanel - deduction controls W1: file-name deduction control and wire", () => {
  it("renders a Deduct for wrong file names checkbox, checked from state, locked after the session starts", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf('label="Deduct for wrong file names"');
    expect(start).toBeGreaterThan(-1);
    const open = source.lastIndexOf("<FormControlLabel", start);
    const control = source.slice(open, start);
    expect(control).toContain("<Checkbox");
    expect(control).toContain("checked={applyNamingDeduction}");
    expect(control).toContain("disabled={sessionReady}");
  });

  it("persists under its own key, defaults ON, and restores in a mount effect", () => {
    const source = withoutLineComments(read(PANEL));
    expect(source).toContain('APPLY_NAMING_DEDUCTION_STORAGE_KEY = "ta-grading-chat-apply-naming-deduction"');
    expect(source).toContain("localStorage.setItem(APPLY_NAMING_DEDUCTION_STORAGE_KEY");
    expect(source).toMatch(/useState\(true\)/);
    expect(source).toContain("loadApplyNamingDeduction()");
  });

  it("captures the flag at beginSession (not per submit)", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.lastIndexOf("driver.beginSession(");
    const call = source.slice(start, source.indexOf("});", start));
    expect(call).toMatch(/\bapplyNamingDeduction\b/);
    const driver = withoutLineComments(read(DRIVER));
    expect(driver).toMatch(/applyNamingDeductionRef\.current\s*=\s*sessionParams\.applyNamingDeduction\s*\?\?\s*true/);
  });

  it("the driver conditional-spreads the flag only when OFF, default wire byte-identical", () => {
    const driver = withoutLineComments(read(DRIVER));
    expect(driver).toContain("...(applyNamingDeductionRef.current === false ? { applyNamingDeduction: false } : {})");
    expect(driver).not.toMatch(/^\s*applyNamingDeduction(:|,)/m);
  });
});

describe("GradingChatPanel - deduction controls W2: length deduction control and wire", () => {
  it("renders a Deduct for length checkbox, checked from state, locked after the session starts", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf('label="Deduct for length"');
    expect(start).toBeGreaterThan(-1);
    const open = source.lastIndexOf("<FormControlLabel", start);
    const control = source.slice(open, start);
    expect(control).toContain("<Checkbox");
    expect(control).toContain("checked={applyLengthDeduction}");
    expect(control).toContain("disabled={sessionReady || busy || preparing || roleIntake.pending}");
  });

  it("persists under its own key, defaults OFF, and restores in a mount effect", () => {
    const source = withoutLineComments(read(PANEL));
    expect(source).toContain('APPLY_LENGTH_DEDUCTION_STORAGE_KEY = "ta-grading-chat-apply-length-deduction"');
    expect(source).toContain("localStorage.setItem(APPLY_LENGTH_DEDUCTION_STORAGE_KEY");
    expect(source).toContain("[applyLengthDeduction, setApplyLengthDeduction] = useState(false)");
    expect(source).toContain("loadApplyLengthDeduction()");
  });

  it("captures the flag at beginSession (not per submit)", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.lastIndexOf("driver.beginSession(");
    const call = source.slice(start, source.indexOf("});", start));
    expect(call).toMatch(/\bapplyLengthDeduction\b/);
    const driver = withoutLineComments(read(DRIVER));
    expect(driver).toMatch(/applyLengthDeductionRef\.current\s*=\s*sessionParams\.applyLengthDeduction\s*\?\?\s*false/);
  });

  it("the driver conditional-spreads the flag only when ON, default wire byte-identical", () => {
    const driver = withoutLineComments(read(DRIVER));
    expect(driver).toContain("...(applyLengthDeductionRef.current === true ? { applyLengthDeduction: true } : {})");
    expect(driver).not.toMatch(/^\s*applyLengthDeduction(:|,)/m);
  });
});

describe("GradingChatPanel - feedback length control W2: word-count field and wire", () => {
  it("renders a numeric word-count field locked after the session starts", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf('label="Feedback word count (optional)"');
    expect(start).toBeGreaterThan(-1);
    const open = source.lastIndexOf("<TextField", start);
    const field = source.slice(open, source.indexOf("/>", start));
    expect(field).toContain('type="number"');
    expect(field).toContain("disabled={sessionReady}");
    expect(field).toContain("FEEDBACK_WORD_TARGET_MIN");
    expect(field).toContain("FEEDBACK_WORD_TARGET_MAX");
  });

  it("persists the raw text under its own key and restores it in a mount effect", () => {
    const source = withoutLineComments(read(PANEL));
    expect(source).toContain('FEEDBACK_LENGTH_STORAGE_KEY = "ta-grading-chat-feedback-length"');
    expect(source).toContain("localStorage.setItem(FEEDBACK_LENGTH_STORAGE_KEY");
    expect(source).toContain('const [feedbackLengthText, setFeedbackLengthText] = useState("")');
    expect(source).toContain("await Promise.resolve(loadFeedbackLength())");
  });

  it("beginSession receives the coerced target (captured once, not per submit)", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.lastIndexOf("driver.beginSession(");
    const call = source.slice(start, source.indexOf("});", start));
    expect(call).toContain("feedbackWordTarget: coerceFeedbackWordTarget(feedbackLengthText)");
    const driver = withoutLineComments(read(DRIVER));
    expect(driver).toMatch(/feedbackWordTargetRef\.current\s*=\s*sessionParams\.feedbackWordTarget/);
    expect(driver).toMatch(/feedbackWordTargetRef\.current\s*=\s*undefined/);
  });

  it("the driver conditional-spreads feedbackWordTarget, default wire byte-identical", () => {
    const driver = withoutLineComments(read(DRIVER));
    expect(driver).toContain(
      "...(feedbackWordTargetRef.current !== undefined ? { feedbackWordTarget: feedbackWordTargetRef.current } : {})",
    );
    expect(driver).not.toMatch(/^\s*feedbackWordTarget(:|,)/m);
  });
});

describe("ChatComposer - record-a-submission: frames become composite parts", () => {
  it("has a Record segment and loadInputMode admits it", () => {
    const source = withoutLineComments(read(COMPOSER));
    expect(source).toContain('{ value: "record", label: "Record" }');
    expect(source).toMatch(/stored === "record"/);
  });

  it("wires useChatScreenFrameCapture and adds each stopped frame as a composite file part", () => {
    const source = withoutLineComments(read(COMPOSER));
    expect(source).toContain("useChatScreenFrameCapture(");
    const start = source.indexOf("useChatScreenFrameCapture(");
    const call = source.slice(start, source.indexOf(");", start));
    expect(call).toContain("addParts(");
    expect(call).toContain('kind: "file"');
  });

  it("does not persist under a second key (record reuses the input-mode key)", () => {
    expect(withoutLineComments(read("src/app/components/grading-chat/chatFrameCapture.ts"))).not.toContain("ta-");
  });
});

describe("GradingChatPanel - recording split confirm surface (reachability)", () => {
  it("renders RecordingSplitConfirm from driver.pendingSplit in normal flow, wired to both driver actions", () => {
    const source = withoutLineComments(read(PANEL));
    const sticky = source.indexOf("chatStyles.auxiliary");
    const at = source.indexOf("<RecordingSplitConfirm");
    expect(sticky).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(sticky);
    const tag = source.slice(at, source.indexOf("/>", at));
    expect(tag).toContain("pending={driver.pendingSplit}");
    expect(tag).toContain("onConfirm={handleConfirmSplit}");
    expect(tag).toContain("onReject={handleRejectSplit}");
    expect(source).toContain("driver.confirmRecordingSplit()");
    expect(source).toContain("driver.rejectRecordingSplit()");
  });

  it("the confirm component introduces no persisted ta- key", () => {
    expect(withoutLineComments(read("src/app/components/grading-chat/RecordingSplitConfirm.tsx"))).not.toContain("ta-");
  });
});

describe("GradingChatPanel - locked setup text stays copyable (read-only, not editable)", () => {
  function lockedSlice(): string {
    const source = withoutLineComments(read(PANEL));
    const from = source.indexOf("chatStyles.setupSummary");
    const to = source.indexOf("chatStyles.settingsGrid", from);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    return source.slice(from, to);
  }

  it("renders both locked fields read-only with no change path and no disabled", () => {
    const slice = lockedSlice();
    expect(slice).toContain("grading-chat-instructions-locked");
    expect(slice).toContain("grading-chat-rubric-locked");
    expect(slice.match(/readOnly: true/g)?.length).toBe(2);
    expect(slice).not.toContain("onChange=");
    expect(slice).not.toContain("disabled=");
  });

  it("binds each Copy button to its own value", () => {
    const slice = lockedSlice();
    expect(slice).toMatch(/onCopy\(\s*COPY_KEY_INSTRUCTIONS\s*,\s*instructions\s*\)/);
    expect(slice).toMatch(/onCopy\(\s*COPY_KEY_RUBRIC\s*,\s*rubric\s*\)/);
  });

  it("wires the Copied affordance to copiedKey", () => {
    expect(lockedSlice()).toContain("copiedKey ===");
  });
});

describe("GradingChatPanel - recording analyzing indicator", () => {
  const source = () => withoutLineComments(read(PANEL));

  it("hands the driver's classifyingRecording flag to describeRunStatus and owns no copy for it", () => {
    const src = source();
    const start = src.indexOf("describeRunStatus({");
    expect(start).toBeGreaterThan(-1);
    const slice = src.slice(start, src.indexOf("})", start));
    expect(slice).toMatch(/classifyingRecording:\s*driver\.classifyingRecording\b/);
    expect(src).not.toContain("Analyzing the recording");
  });

  it("GradingProgress renders the canonical spinner as a busy status region", () => {
    const src = source();
    const start = src.indexOf("function GradingProgress");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    expect(body).toContain("styles.spinner");
    expect(body).toContain('role="status"');
    expect(body).toContain("aria-busy");
  });

  it("keeps normal-flow order: confirm card, then progress, then composer", () => {
    const src = source();
    const a = src.indexOf("chatStyles.auxiliary");
    const b = src.indexOf("<RecordingSplitConfirm", a);
    const c = src.indexOf("<GradingProgress", a);
    const d = src.indexOf("<ChatComposer", a);
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
  });
});

// CHAT-GRADING-DIAGNOSTICS WD (docs/chat-grading-detailed-diagnostics-scope.md,
// AC-16/AC-18). Source-text pins only: nothing renders under vitest, so the
// rendered panel is an OWNER walk.
describe("GradingChatPanel - WD run-diagnostics panel (reachability and copy safety)", () => {
  const source = () => withoutLineComments(read(PANEL));
  const fn = (name: string) => {
    const src = source();
    const start = src.indexOf(`function ${name}`);
    expect(start, name).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf("\n}\n", start));
  };

  it("mounts RunDiagnostics with driver.diagnostics inside the results stream, after GradingResults", () => {
    const src = source();
    const mount = src.indexOf("<RunDiagnostics");
    expect(mount).toBeGreaterThan(src.indexOf("<GradingResults"));
    expect(mount).toBeLessThan(src.indexOf("chatStyles.stickyComposer"));
    expect(src.slice(mount, src.indexOf("/>", mount))).toContain("items={driver.diagnostics}");
  });

  it("renders a collapsed native <details> with a summary line, reusing the existing classes", () => {
    const body = fn("RunDiagnostics");
    expect(body).toContain("<details className={styles.generatedRubricCard}>");
    expect(body).not.toMatch(/<details[^>]*\sopen/);
    expect(body).toContain("<summary>{summarizeDiagnostics(items)}</summary>");
    expect(body).toContain("styles.generatedRubricTable");
    expect(body).toContain("styles.ghMeta");
    expect(fn("summarizeDiagnostics")).toMatch(/graded, .*needs-retry, avg/);
  });

  it("copies the text built by formatDiagnosticsText through onCopy", () => {
    expect(fn("RunDiagnostics")).toMatch(/onCopy\(COPY_KEY_DIAGNOSTICS,\s*formatDiagnosticsText\(items\)\)/);
  });

  it("the copy text uses rowLabel and never the student label", () => {
    const body = fn("formatDiagnosticsText");
    expect(body).toContain("d.rowLabel");
    expect(body).not.toMatch(/\.label\b/);
    expect(body).not.toMatch(/\.student\b/);
  });

  it("adds no storage: the panel code never touches localStorage and the key is a copy slot, not a ta- key", () => {
    const panel = fn("RunDiagnostics") + fn("summarizeDiagnostics") + fn("formatDiagnosticsText");
    expect(panel).not.toContain("localStorage");
    expect(source()).toContain('COPY_KEY_DIAGNOSTICS = "chat-run-diagnostics"');
  });
});
