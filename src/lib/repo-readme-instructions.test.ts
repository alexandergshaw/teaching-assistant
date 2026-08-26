// vitest is node-env and collects only src/**/*.test.ts - pickReadmeInstructions
// is pure (no I/O), so these are plain function-in, value-out assertions
// against hand-built file lists. Every expectation is a frozen literal pinned
// to the documented rules, never derived from re-running the implementation.

import { describe, it, expect } from "vitest";
import { pickReadmeInstructions } from "./repo-readme-instructions";

function file(path: string, content: string) {
  return { path, content };
}

describe("pickReadmeInstructions", () => {
  it("returns null when there is no README at all", () => {
    const files = [file("src/index.ts", "console.log(1)"), file("package.json", "{}")];
    expect(pickReadmeInstructions(files)).toBeNull();
  });

  it("picks a README at the folder root", () => {
    const files = [file("README.md", "Do the assignment."), file("src/index.ts", "code")];
    expect(pickReadmeInstructions(files)).toEqual({ instructions: "Do the assignment.", path: "README.md" });
  });

  it("prefers the shallower README over a deeper one", () => {
    const files = [
      file("README.md", "Top-level instructions."),
      file("src/vendor/README.md", "Vendor library docs."),
    ];
    expect(pickReadmeInstructions(files)).toEqual({ instructions: "Top-level instructions.", path: "README.md" });
  });

  it("prefers README.md over readme.txt at the same depth", () => {
    const files = [file("readme.txt", "Text version."), file("README.md", "Markdown version.")];
    expect(pickReadmeInstructions(files)).toEqual({ instructions: "Markdown version.", path: "README.md" });
  });

  it("does not match a directory named readmes/", () => {
    const files = [file("readmes/week1.md", "Not a readme file itself."), file("src/index.ts", "code")];
    expect(pickReadmeInstructions(files)).toBeNull();
  });

  it("still matches a basename that merely contains 'readme', per the documented /readme/i intent", () => {
    // Rule 1 only tightens matching to the basename (so a "readmes/" DIRECTORY
    // can't win via a later segment) - it does not require the basename to be
    // exactly "readme"; a file whose own name contains "readme" still matches,
    // same as the /readme/i this mirrors in steps.grading-repos.helpers.ts.
    const files = [file("scripts/not-a-readme-parser.ts", "export {}")];
    expect(pickReadmeInstructions(files)).toEqual({ instructions: "export {}", path: "scripts/not-a-readme-parser.ts" });
  });

  it("returns null for a blank README instead of grading against empty instructions", () => {
    const files = [file("README.md", "   \n\t  ")];
    expect(pickReadmeInstructions(files)).toBeNull();
  });

  it("measures depth relative to pathPrefix, preferring the prefix folder's own README", () => {
    const files = [
      file("README.md", "Repo-root readme - not the assignment."),
      file("week3/README.md", "Assignment readme."),
      file("week3/extra/notes/README.md", "Deeply nested readme."),
    ];
    const pick = pickReadmeInstructions(files, "week3");
    expect(pick).toEqual({ instructions: "Assignment readme.", path: "week3/README.md" });
  });

  it("never lets a README outside pathPrefix beat one inside it", () => {
    const files = [
      file("README.md", "Repo-root readme - not the assignment."),
      file("week3/README.md", "Assignment readme."),
    ];
    const pick = pickReadmeInstructions(files, "week3");
    expect(pick).toEqual({ instructions: "Assignment readme.", path: "week3/README.md" });
  });

  it("measures depth from the digest root when pathPrefix is omitted", () => {
    const files = [file("a/README.md", "Shallower."), file("a/b/README.md", "Deeper.")];
    expect(pickReadmeInstructions(files)).toEqual({ instructions: "Shallower.", path: "a/README.md" });
  });

  it("breaks remaining ties lexicographically by path", () => {
    const files = [file("b/README.md", "B readme."), file("a/README.md", "A readme.")];
    expect(pickReadmeInstructions(files)).toEqual({ instructions: "A readme.", path: "a/README.md" });
  });

  it("does not mutate the input array or its file objects", () => {
    const files = [file("README.md", "Instructions."), file("src/index.ts", "code")];
    const snapshot = JSON.parse(JSON.stringify(files));
    pickReadmeInstructions(files, "");
    expect(files).toEqual(snapshot);
  });
});
