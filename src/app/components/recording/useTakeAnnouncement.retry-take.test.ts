import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveTakePostFailure, takePostArmSignature, type TakePostFailure } from "./takeAnnouncementArming";
import { isConfirmArmed } from "../content-tab/modules/confirmArming";
import { mayPostCommit } from "../content-tab/modules/postConfirmArming";

// WA-POST-RETRY-TAKE W1. AC-1..AC-3 execute the real leaf and the real arming
// functions. AC-4, AC-5 and AC-8 are READ-level wiring pins over comment-
// stripped function bodies: they prove the hook calls the leaf and no longer
// clears the error, not rendered behaviour.

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

const INPUTS: TakePostFailure[] = [
  { error: "Canvas refused access" },
  { error: "Canvas did not respond." },
  { transport: true },
];
const sig = JSON.stringify([takePostArmSignature("take-1", "course-1", "ACME"), "s", "b"]);

const stripped = withoutLineComments(readFileSync(HOOK, "utf8"));
const commitPostBody = bodySlice(stripped, /async function commitPost\(\)\s*\{/);
const backBody = bodySlice(stripped, /function backToReviewAfterPostFailure\(\)\s*\{/);

describe("resolveTakePostFailure (EXECUTED)", () => {
  it("AC-1: every failure shape carries a null arm", () => {
    for (const input of INPUTS) {
      const out = resolveTakePostFailure(input);
      expect("armedFor" in out).toBe(true);
      expect(out.armedFor).toBeNull();
    }
  });

  it("AC-2: copy is honest and class-correct", () => {
    const [refusalA, refusalB, transport] = INPUTS.map((i) => resolveTakePostFailure(i).message);
    for (const m of [refusalA, refusalB, transport]) {
      expect(m).not.toMatch(/nothing was posted/i);
      expect(m).toMatch(/check/i);
      expect(m).toMatch(/Canvas/);
    }
    expect(transport).toMatch(/may or may not/i);
    expect(refusalA).not.toMatch(/may or may not/i);
    expect(refusalB).not.toMatch(/may or may not/i);
    expect(refusalA.includes("Canvas refused access")).toBe(true);
    expect(refusalB.includes("Canvas did not respond.")).toBe(true);
  });

  it("AC-3: after a failure the next click arms, and a fresh arm still commits", () => {
    expect(isConfirmArmed(resolveTakePostFailure({ error: "x" }).armedFor, sig)).toBe(false);
    expect(isConfirmArmed(sig, sig)).toBe(true);
    expect(mayPostCommit(null, false, true)).toBe(true);
  });
});

describe("useTakeAnnouncement failure wiring (READ)", () => {
  it("the stripping helper really removes comments", () => {
    expect(withoutLineComments("a(); // setArmedFor\n/* setArmedFor */ b();")).not.toContain("setArmedFor");
  });

  it("AC-4: the failure exit disarms through the leaf's own armedFor", () => {
    expect(commitPostBody).toMatch(/resolveTakePostFailure\(/);
    expect(commitPostBody).toMatch(/setArmedFor\(\s*[^)]*\.armedFor\s*\)/);
    expect(commitPostBody).toMatch(/\w+\.message\b/);
    expect(commitPostBody).toMatch(/setArmedFor\(\s*null\s*\)/);
    const disarm = commitPostBody.search(/setArmedFor\(\s*[^)]*\.armedFor\s*\)/);
    expect(disarm).toBeGreaterThan(-1);
    expect(disarm).toBeLessThan(commitPostBody.indexOf("runTakeDraftPostCleanup("));
  });

  it("AC-5: a rejection takes the same exit and the branch routes the transport shape", () => {
    expect(commitPostBody).toMatch(/createAnnouncementAction\([\s\S]*?\)\s*\.catch\(/);
    expect(commitPostBody).toMatch(/transport/);
    expect(commitPostBody).toMatch(/"transport"\s+in\s+\w+/);
    expect(commitPostBody).toMatch(/resolveTakePostFailure\(/);
  });

  it("AC-8: Back to review no longer clears the failure message", () => {
    expect(backBody).not.toMatch(/setPostError\(/);
  });
});
