import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("recording announcement editor wiring", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/components/recording/RecordingAnnouncementEditor.tsx"), "utf8");
  it("normalizes visible content when the user leaves both the editor and toolbar", () => {
    expect(source).toContain("event.currentTarget.contains(event.relatedTarget)");
    expect(source).toContain("if (ref.current.innerHTML !== safe) ref.current.innerHTML = safe");
    expect(source).toContain("onChange(safe)");
  });
  it("retains a selection for toolbar commands and disables editing while busy", () => {
    expect(source).toContain("selection.addRange(selectionRef.current)");
    expect(source).toContain("contentEditable={!disabled}");
    expect(source).toContain("disabled={disabled}");
  });
});
