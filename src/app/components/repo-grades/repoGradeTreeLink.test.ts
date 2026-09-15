// Tests for repoGradeTreeLink.ts - A5's row-level link builder. Every case
// below is a frozen literal, hand-written against a5-ac.md's case table
// (never computed from the implementation), except where noted.
import { describe, it, expect } from "vitest";
import { buildRepoGradeRowLinkHref, buildRepoGradeRowLinkText } from "./repoGradeTreeLink";
import { ALL_FOLDERS } from "./repoGradesFolderSelection";

const URL = "https://github.com/acme/repo1";

describe("buildRepoGradeRowLinkHref", () => {
  // Case 1/2 (Ruling A5-3): an empty htmlUrl is representable
  // (github.repos.ts:92's `r.html_url ?? ""`), and `${""}/tree/...` is a
  // same-origin relative URL that would navigate INSIDE this app - the
  // builder must refuse to build one regardless of branch or folder.
  it("case 1: an empty htmlUrl yields null for a specific folder", () => {
    expect(buildRepoGradeRowLinkHref("", "main", "week-1")).toBeNull();
  });

  it("case 2: an empty htmlUrl yields null for ALL_FOLDERS too", () => {
    expect(buildRepoGradeRowLinkHref("", "main", ALL_FOLDERS)).toBeNull();
  });

  it("case 3: a specific folder builds a /tree/<branch>/<folder> URL", () => {
    expect(buildRepoGradeRowLinkHref(URL, "main", "week-1")).toBe(`${URL}/tree/main/week-1`);
  });

  it("case 4: ALL_FOLDERS falls back to the bare repo root, unchanged - no /tree suffix (Ruling A5-5's stated gap)", () => {
    expect(buildRepoGradeRowLinkHref(URL, "main", ALL_FOLDERS)).toBe(URL);
  });

  it("case 5: a nested folder path encodes each '/'-separated segment independently and rejoins with a literal '/' - a whole-path encodeURIComponent (which would also escape the '/') fails this case", () => {
    expect(buildRepoGradeRowLinkHref(URL, "main", "assignments/module_03")).toBe(`${URL}/tree/main/assignments/module_03`);
  });

  it("case 6: a folder with a space is percent-encoded", () => {
    expect(buildRepoGradeRowLinkHref(URL, "main", "week 1")).toBe(`${URL}/tree/main/week%201`);
  });

  it("case 7: a Unicode folder encodes to a FROZEN literal - hand-verified via `node -e \"console.log(encodeURIComponent('递交'))\"` -> %E9%80%92%E4%BA%A4, never recomputed here with the implementation's own expression (that would be a tautology that passes alongside a broken implementation)", () => {
    expect(buildRepoGradeRowLinkHref(URL, "main", "递交")).toBe(`${URL}/tree/main/%E9%80%92%E4%BA%A4`);
  });

  it("case 9: an empty selectedFolder (defensive; resolveSelectedFolder never actually returns one) leaves htmlUrl unchanged rather than producing a dangling trailing slash", () => {
    expect(buildRepoGradeRowLinkHref(URL, "main", "")).toBe(URL);
  });

  it("case 10: a folder with a URL-significant ASCII character - the case that separates encodeURIComponent from encodeURI. Hand-verified: encodeURIComponent(\"week#1\") -> \"week%231\", encodeURI(\"week#1\") -> \"week#1\" (unescaped) - every other case above produces an identical result under either encoder, so this is the one that actually proves the correct encoder was used", () => {
    expect(buildRepoGradeRowLinkHref(URL, "main", "week#1")).toBe(`${URL}/tree/main/week%231`);
  });

  // Ruling A5-7: every case above uses branch "main", which a leaf
  // implemented as `${htmlUrl}/tree/main/${segment}` (a hardcoded branch)
  // would pass in full. This case uses "develop" instead - the same value
  // repoGradesRows.test.ts's provenance case uses - so a hardcode is caught
  // by the identical string appearing in both places.
  it("uses the BRANCH argument, not a hardcoded \"main\" - a non-main branch reaches the URL verbatim (Ruling A5-7)", () => {
    expect(buildRepoGradeRowLinkHref(URL, "develop", "week-1")).toBe(`${URL}/tree/develop/week-1`);
  });
});

describe("buildRepoGradeRowLinkText", () => {
  // Case 8.
  it("case 8: always '<repo> @ <branch>' - used only for aria-label/title (Ruling A5-6), never the visible row text", () => {
    expect(buildRepoGradeRowLinkText("acme/repo1", "main")).toBe("acme/repo1 @ main");
  });

  it("uses the branch argument verbatim, not hardcoded", () => {
    expect(buildRepoGradeRowLinkText("acme/repo1", "develop")).toBe("acme/repo1 @ develop");
  });
});

// --------------------------------------------------------------------------
// SABOTAGE-CHECK LOG (each verified by hand: broke the behavior, ran
// `npx vitest run src/app/components/repo-grades/repoGradeTreeLink.test.ts`,
// confirmed a failure, then reverted before re-running to confirm green
// again).
//
// 1. Hardcoded the branch: changed buildRepoGradeRowLinkHref's template
//    literal from `/tree/${encodeURIComponent(branch)}/...` to a literal
//    `/tree/main/...`. Result: "uses the BRANCH argument, not a hardcoded
//    'main'" failed - expected ".../tree/develop/week-1", got
//    ".../tree/main/week-1". Reverted; suite green again.
// 2. Used encodeURI instead of encodeURIComponent per segment. Result: case
//    10 ("week#1") failed - expected "week%231", got "week#1" (encodeURI
//    leaves "#" unescaped). Cases 5/6/7 stayed green under this sabotage
//    (confirmed by hand this pass), which is exactly why case 10 - not those
//    three - is the one that actually discriminates the two encoders.
// 3. Encoded the whole selectedFolder as one segment
//    (`encodeURIComponent(selectedFolder)` instead of splitting on "/"
//    first). Result: case 5 (nested folder) failed - expected
//    ".../assignments/module_03", got ".../assignments%2Fmodule_03" (the "/"
//    itself got escaped). Reverted; suite green again.
// 4. Removed the `htmlUrl === ""` guard entirely. Result: cases 1/2 failed -
//    expected `null`, got "/tree/main/week-1" and
//    "https://github.com/acme/repo1" respectively for case 2 (case 2 only
//    fails because case 1's guard covers both; verified case 1 alone catches
//    the regression). Reverted; suite green again.
// --------------------------------------------------------------------------
