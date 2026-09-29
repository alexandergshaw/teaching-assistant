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
