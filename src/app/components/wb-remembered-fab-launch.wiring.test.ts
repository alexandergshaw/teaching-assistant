import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// CRLF-safe line-comment removal (the end-of-line form is CRLF-blind).
function withoutLineComments(text: string): string {
  return text.replace(/\/\/[^\n\r]*/g, "");
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("W-B-3: AiChatFab handler lands on the remembered sub-view", () => {
  const src = read("src/app/components/AiChatFab.tsx");
  const start = src.indexOf("const handleOpenRecordingTools");
  const end = src.indexOf("}, []);", start);

  it("both slice anchors resolve", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("no longer forces record, sends the remembered sentinel", () => {
    const slice = withoutLineComments(src.slice(start, end));
    expect(slice).not.toMatch(/navigateToRecordingTool\("record"\)/);
    expect(slice).toMatch(/navigateToRecordingTool\("remembered"\)/);
  });
});

describe("W-B-4: RecordingTab does not overwrite recView on the sentinel", () => {
  const src = read("src/app/components/RecordingTab.tsx");
  const start = src.indexOf("const handler = (e: Event) => {");
  const end = src.indexOf("window.addEventListener(RECORDING_LAUNCH_EVENT, handler);", start);

  it("both slice anchors resolve", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("guards the sentinel before setRecView and never forces a literal", () => {
    const slice = withoutLineComments(src.slice(start, end));
    const guard = slice.indexOf('detail.view === "remembered"');
    const set = slice.indexOf("setRecView(detail.view)");
    expect(guard).toBeGreaterThan(-1);
    expect(set).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(set);
    expect(slice).not.toMatch(/setRecView\("record"\)/);
  });
});
