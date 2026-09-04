import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// docs/message-replies-acceptance-criteria.md M14/M15/M16/M18 (section 7):
// the toolbar's own control set and order ("Draft the missing replies" ->
// "Match to Canvas (N)" -> "Save all as drafts (N)" -> Delete table), and
// the "exactly ONE primary in the whole feature" rule this file is the
// single site for (buttonVariant.test.ts's own FROZEN_PRIMARY_SITES pins
// the repo-wide count; this file pins the LOCAL fact a sabotage could still
// slip past that count check - e.g. swapping which button carries
// variantFor while keeping the total at 1).

const SOURCE_PATH = path.join(process.cwd(), "src/app/components/message-replies/MessageReplyToolbar.tsx");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

function stripComments(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("MessageReplyToolbar.tsx - the whole-table action bar, pinned as source text", () => {
  const stripped = stripComments(source);

  it('exactly one variantFor(...) call, and it is on "Draft the missing replies"', () => {
    const calls = stripped.match(/variantFor\(/g) ?? [];
    expect(calls.length).toBe(1);
    const idx = stripped.indexOf("variantFor(");
    const tail = stripped.slice(idx, idx + 200);
    expect(tail).toMatch(/Draft the missing replies/);
  });

  it("no static variant=\"contained\" anywhere - the only primary spelling in this file is the one variantFor( call", () => {
    expect(stripped).not.toMatch(/variant="contained"/);
  });

  it('control order: "Draft the missing replies" -> "Match to Canvas (N)" -> "Save all as drafts (N)" -> Delete table', () => {
    const draftIdx = stripped.indexOf("Draft the missing replies");
    const matchIdx = stripped.indexOf("Match to Canvas ($");
    const saveAllIdx = stripped.indexOf("Save all as drafts ($");
    const deleteIdx = stripped.indexOf('idleLabel="Delete table"');
    for (const i of [draftIdx, matchIdx, saveAllIdx, deleteIdx]) expect(i).toBeGreaterThan(-1);
    expect(draftIdx).toBeLessThan(matchIdx);
    expect(matchIdx).toBeLessThan(saveAllIdx);
    expect(saveAllIdx).toBeLessThan(deleteIdx);
  });

  it('"Match to Canvas (N)" disables at zero unmatched with the exact M15 title text', () => {
    const idx = stripped.indexOf("Match to Canvas ($");
    const tag = stripped.slice(stripped.lastIndexOf("<Button", idx), idx);
    expect(tag).toMatch(/disabled=\{unmatchedCount === 0\}/);
    expect(tag).toMatch(/title=\{unmatchedCount === 0 \? "Every thread is matched" : undefined\}/);
  });

  it('Delete table is a ConfirmArmButtons with tone="danger", idleVariant is the component default (outlined), pushed to controls.pushEnd', () => {
    const idx = stripped.indexOf('idleLabel="Delete table"');
    const tag = stripped.slice(stripped.lastIndexOf("<ConfirmArmButtons", idx), idx + 300);
    expect(tag).toMatch(/tone="danger"/);
    expect(tag).toMatch(/idleVariant="outlined"/);
    expect(stripped).toMatch(/<span className=\{controls\.pushEnd\}>\s*<ConfirmArmButtons/);
  });

  it("status chips use MESSAGE_STATUS_FILTERS/labels (M18's own six-member union, not the discussion tool's five)", () => {
    expect(stripped).toMatch(/MESSAGE_STATUS_FILTERS\.map/);
    expect(stripped).toMatch(/import \{ MESSAGE_STATUS_FILTERS, MESSAGE_STATUS_FILTER_LABELS, type MessageStatusFilter \} from "\.\/message-table-view";/);
  });

  it("this file never renders Skip / Mark as handled / Remove - those live in the per-row More menu (MessageThreadRowActions.tsx), not the whole-table bar", () => {
    expect(stripped).not.toMatch(/Skip - no reply needed/);
    expect(stripped).not.toMatch(/Mark as handled/);
  });
});
