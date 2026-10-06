import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Pins the server half of the response-mode seam as FACTS about the route
// source, mirroring the selectionContextText wiring test: the field is
// declared on the RequestBody, read off the body, and routed through
// chatStyleBlockForMode into buildChatSystemInstruction. Without the read, a
// client sending "informational" would be silently ignored.

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((line) => line.replace(/\/\/.*$/, "")).join("\n");
}

const routeSource = stripComments(
  readFileSync(join(process.cwd(), "src/app/api/ai-chat/route.ts"), "utf8"),
);

describe("responseMode survives the route half of the wire", () => {
  it("the route declares responseMode on its RequestBody type", () => {
    const start = routeSource.indexOf("interface RequestBody {");
    expect(start).toBeGreaterThan(-1);
    const end = routeSource.indexOf("\n}", start);
    expect(routeSource.slice(start, end)).toContain("responseMode");
  });

  it("the route reads body.responseMode", () => {
    expect(routeSource).toContain("body.responseMode");
  });

  it("the route passes it through chatStyleBlockForMode into buildChatSystemInstruction", () => {
    expect(routeSource).toMatch(
      /buildChatSystemInstruction\(\s*chatStyleBlockForMode\(\s*styleBlock\s*,\s*body\.responseMode\s*\)\s*\)/,
    );
  });
});

// W2 half of the seam: the FAB (the only producer of an explicit mode) sends
// responseMode in the /api/ai-chat POST body and persists the choice.
const fabSource = stripComments(
  readFileSync(join(process.cwd(), "src/app/components/AiChatFab.tsx"), "utf8"),
);

describe("responseMode survives the client half of the wire", () => {
  it("the FAB sends responseMode in the /api/ai-chat POST body", () => {
    const start = fabSource.indexOf('fetch("/api/ai-chat"');
    expect(start).toBeGreaterThan(-1);
    const end = fabSource.indexOf("});", start);
    expect(fabSource.slice(start, end)).toMatch(/responseMode\s*:/);
  });

  it("the FAB reads and writes the ta:-prefixed ask-ai-voice-mode key", () => {
    expect(fabSource).toMatch(/readLS<[^>]*>\(\s*"ask-ai-voice-mode"/);
    expect(fabSource).toMatch(/writeLS\(\s*"ask-ai-voice-mode"/);
  });
});
