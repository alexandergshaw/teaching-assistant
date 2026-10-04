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
  it("uses styles.field/styles.form for instructions and rubric, matching GradingTab's own pattern", () => {
    const source = read(PANEL);
    expect(source).toContain("styles.form");
    expect(source).toContain("styles.field");
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

describe("GradingChatPanel - W2 O3 panel-feed: the driver is constructed with commentSplit: true", () => {
  it("the useContinuousGradingRun( construction call carries commentSplit: true", () => {
    const source = withoutLineComments(read(PANEL));
    const start = source.indexOf("useContinuousGradingRun(");
    expect(start, "expected the driver construction call").toBeGreaterThan(-1);
    const end = source.indexOf(");", start);
    expect(source.slice(start, end)).toMatch(/commentSplit\s*:\s*true/);
  });
});
