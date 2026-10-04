import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// READ-level reachability for W2 (drafts-loop): the hook must actually CALL the
// lifecycle leaf from saveDraft and from commitPost's success branch. The
// searches run over a comment-stripped, brace-delimited function-body slice so
// a comment that merely names a call can never satisfy an assertion. Source
// text cannot prove runtime behaviour; this is a wiring claim only.

const HOOK = join(__dirname, "useTakeAnnouncement.ts");

function withoutLineComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n\r]*/g, "");
}

function bodySlice(src: string, anchor: RegExp): string {
  const m = anchor.exec(src);
  expect(m, `anchor ${anchor} must resolve`).not.toBeNull();
  const open = src.indexOf("{", (m as RegExpExecArray).index + (m as RegExpExecArray)[0].length - 1);
  expect(open).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces after ${anchor}`);
}

const stripped = withoutLineComments(readFileSync(HOOK, "utf8"));
const saveDraftBody = bodySlice(stripped, /function saveDraft\(\)\s*\{/);
const commitPostBody = bodySlice(stripped, /async function commitPost\(\)\s*\{/);

describe("useTakeAnnouncement drafts-loop wiring (READ)", () => {
  it("the stripping helper really removes comments", () => {
    expect(withoutLineComments("a(); // runTakeDraftSave\n/* runTakeDraftSave */ b();")).not.toContain("runTakeDraftSave");
  });

  it("saveDraft calls runTakeDraftSave with the save and update actions", () => {
    expect(saveDraftBody).toMatch(/runTakeDraftSave\(/);
    expect(saveDraftBody).toMatch(/save:\s*saveMessageDraftAction/);
    expect(saveDraftBody).toMatch(/update:\s*updateMessageDraftPayloadAction/);
    expect(saveDraftBody).toMatch(/refreshDraftsBadge\(\)/);
    expect(saveDraftBody).toMatch(/setDraftSavedHadCourse\(/);
  });

  it("commitPost calls runTakeDraftPostCleanup with markMessageDraftReviewedAction and refreshes the badge", () => {
    expect(commitPostBody).toMatch(/runTakeDraftPostCleanup\(/);
    expect(commitPostBody).toMatch(/cleanup:\s*markMessageDraftReviewedAction/);
    expect(commitPostBody).toMatch(/refreshDraftsBadge\(\)/);
  });

  it("the cleanup call comes after the successful-post branch, not the failure return", () => {
    const failureReturn = commitPostBody.indexOf("return;");
    expect(failureReturn).toBeGreaterThan(-1);
    expect(commitPostBody.indexOf("runTakeDraftPostCleanup(")).toBeGreaterThan(failureReturn);
  });

  it("commitPost does not reuse postMessageDraftAction (would double-post)", () => {
    expect(stripped).not.toMatch(/postMessageDraftAction/);
  });
});
