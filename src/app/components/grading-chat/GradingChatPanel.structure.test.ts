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
    expect(source).toMatch(/\{onRegrade\s*&&\s*\([\s\S]{0,400}handleRegradeRow\(result\.student\)[\s\S]{0,200}Regrade/);
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
  return source.slice(start, end);
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

describe("GradingChatPanel - W2 AR1b: beginSession is fed the resolved fill values", () => {
  it("passes fill.instructions and fill.rubric, not the stale state vars", () => {
    const block = ensureSessionBlock();
    const beginStart = block.indexOf("driver.beginSession(");
    expect(beginStart, "expected the beginSession call").toBeGreaterThan(-1);
    const beginEnd = block.indexOf("});", beginStart);
    expect(beginEnd, "expected the beginSession call terminator").toBeGreaterThan(-1);
    const beginBlock = block.slice(beginStart, beginEnd);
    expect(beginBlock).toMatch(/assignmentInstructions:\s*fill\.instructions\b/);
    expect(beginBlock).toMatch(/\brubric:\s*fill\.rubric\b/);
  });
});

describe("GradingChatPanel - W2 AR1c: the Canvas fetch is gated by needsFill (fetch avoidance, not precedence)", () => {
  it("fetchCanvasMetaAction lives inside the if (canvasUrl && scope && needsFill) block", () => {
    const block = ensureSessionBlock();
    const guardIdx = block.indexOf("if (canvasUrl && scope && needsFill)");
    expect(guardIdx, "expected the needsFill guard").toBeGreaterThan(-1);
    const loadedIdx = block.indexOf("const loaded =", guardIdx);
    expect(loadedIdx, "expected the statement after the guard").toBeGreaterThan(-1);
    expect(block.slice(guardIdx, loadedIdx)).toContain("fetchCanvasMetaAction");
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

describe("GradingChatPanel - W3 F4: the intake error rides inside the sticky wrapper, below the results", () => {
  it("submitError role=alert is inside chatStyles.stickyComposer and after the results mount", () => {
    const source = withoutLineComments(read(PANEL));
    const wrapperOpen = source.indexOf("chatStyles.stickyComposer");
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
    const rowOpen = source.lastIndexOf("<div className={styles.adaptRow}>", labelIdx);
    expect(rowOpen).toBeGreaterThan(-1);
    const rowClose = source.indexOf("</div>", labelIdx);
    expect(rowClose).toBeGreaterThan(labelIdx);
    const slice = source.slice(rowOpen, rowClose);
    expect(slice).toContain('aria-label="Send submission"');
  });
});

// GRADER-WORKFLOW-OVERHAUL M1 (docs/grader-m1-latest-result-card-test-notes.md
// AC-M2/AC-M3). Source pins: presence, call on the live run, position. The
// leaf-to-card value flow is closed by the type gate, not by text.
const CARD = "src/app/components/grading-chat/LatestResultCard.tsx";

describe("GradingChatPanel - M1 AC-M2: the latest-result card is wired through the leaf", () => {
  it("imports the card and the selector from their own modules", () => {
    const source = withoutLineComments(read(PANEL));
    expect(source).toMatch(/import\s*\{[^}]*\bLatestResultCard\b[^}]*\}\s*from\s*"\.\/LatestResultCard"/);
    expect(source).toMatch(/import\s*\{[^}]*\bselectLatestResult\b[^}]*\}\s*from\s*"\.\/latestGradedResult"/);
  });

  it("calls selectLatestResult( on driver.run", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf("selectLatestResult(");
    expect(start, "expected a selectLatestResult( call").toBeGreaterThan(-1);
    const end = source.indexOf(")", start);
    expect(source.slice(start, end)).toContain("driver.run");
  });

  it("mounts the card inside the sticky wrapper, above the composer", () => {
    const source = withoutLineComments(read(PANEL));
    const wrapper = source.indexOf("chatStyles.stickyComposer");
    const card = source.indexOf("<LatestResultCard");
    const composer = source.indexOf("<ChatComposer");
    expect(card).toBeGreaterThan(-1);
    expect(wrapper).toBeGreaterThan(-1);
    expect(wrapper).toBeLessThan(card);
    expect(card).toBeLessThan(composer);
  });

  it("the card mount is fed a JS value, not a literal stub", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf("<LatestResultCard");
    const end = source.indexOf("/>", start);
    const slice = source.slice(start, end);
    expect(slice).toContain("{");
    expect(slice).not.toMatch(/result=\{\s*(null|undefined|\[\]|\{\})\s*\}/);
  });

  it("the card is gated on hasRows and a non-null driver.run", () => {
    const source = withoutLineComments(read(PANEL));
    const card = source.indexOf("<LatestResultCard");
    const gate = source.lastIndexOf("hasRows", card);
    expect(gate).toBeGreaterThan(-1);
    expect(source.slice(gate, card)).toContain("driver.run");
  });
});

describe("LatestResultCard - M1 AC-M3: shows the grade and all three feedback fields", () => {
  it("references totalScore and maps the three feedback fields", () => {
    const source = withoutLineComments(read(CARD));
    expect(source).toContain("totalScore");
    const mapsConstant =
      /import\s*\{[^}]*\bFEEDBACK_FIELDS\b[^}]*\}\s*from\s*"\.\.\/grading-results\/gradingResultsHelpers"/.test(source) &&
      source.includes("FEEDBACK_FIELDS.map(");
    const namesAll = ["strengths", "improvements", "resubmitNotice"].every((f) => source.includes(f));
    expect(mapsConstant || namesAll).toBe(true);
  });
});

describe("GradingChatPanel - RG-CLEANUP: no stale legacy seed on the non-Canvas path", () => {
  it("does not read localStorage to seed the setup fields", () => {
    const source = read(PANEL);
    expect(source).not.toContain("loadPersisted");
    expect(source).not.toContain("INSTRUCTIONS_STORAGE_KEY");
    expect(source).not.toContain("RUBRIC_STORAGE_KEY");
    // The only localStorage reads are the harshness and feedback-length
    // preferences; neither seeds the instructions or rubric fields.
    const reads = source.match(/localStorage\.getItem\([^)]*\)/g) ?? [];
    expect(reads).toEqual([
      "localStorage.getItem(HARSHNESS_STORAGE_KEY)",
      "localStorage.getItem(FEEDBACK_LENGTH_STORAGE_KEY)",
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
    expect(pick).toContain("onSubmitFiles(files)");
    expect(pick).toContain("trayActive");
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
    expect(source).toMatch(/!sessionReady\s*&&\s*\(instructions\s*!==\s*""\s*\|\|\s*rubric\s*!==\s*""\)/);
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

describe("GradingChatPanel - controls #2: copy on the latest-result card", () => {
  it("the panel threads copiedKey and onCopy into LatestResultCard", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf("<LatestResultCard");
    const mount = source.slice(start, source.indexOf("/>", start));
    expect(mount).toMatch(/copiedKey=\{copiedKey\}/);
    expect(mount).toMatch(/onCopy=\{onCopy\}/);
  });

  it("the card renders a control that copies the composed feedback under a distinct key", () => {
    const source = withoutLineComments(read(CARD));
    expect(source).toMatch(/copyAllFeedbackText/);
    expect(source).toContain("latest-${result.student}-all-feedback");
    expect(source).toMatch(/onCopy\(copyKey,\s*copyText\(\)\)/);
    expect(source).toMatch(/copiedKey\s*===\s*copyKey/);
    for (const f of ["overallComment", "strengths", "improvements", "resubmitNotice"]) expect(source).toContain(f);
  });
});

describe("GradingChatPanel - controls #4: loading indicators", () => {
  it("every submit handler runs inside withPreparing and the composer is disabled while preparing", () => {
    const source = withoutLineComments(read(PANEL));
    for (const name of ["handleSubmitText", "handleSubmitFiles", "handleSubmitUrl", "handleSubmitComposite"]) {
      const start = source.indexOf(`const ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      expect(source.slice(start, start + 200), name).toContain("withPreparing(");
    }
    expect(source).toMatch(/finally\s*\{\s*setPreparing\(false\)/);
    expect(source).toMatch(/<ChatComposer\s+disabled=\{busy\s*\|\|\s*preparing\}/);
  });

  it("a Grading progress line reads driver.inFlight", () => {
    const source = withoutLineComments(read(PANEL));
    expect(source).toMatch(/driver\.inFlight\s*>\s*0/);
    expect(source).toContain("Grading ${driver.inFlight}");
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
    const start = source.indexOf("driver.beginSession(");
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
    const start = source.indexOf("driver.beginSession(");
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
