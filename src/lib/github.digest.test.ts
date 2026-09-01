import { describe, it, expect, vi } from "vitest";
import {
  ingestRepo,
  selectDigestFiles,
  excludeInstructionsFromDigest,
  isScaffoldingFile,
  DEFAULT_BUDGET,
  SCOPED_BUDGET,
  type SelectDigestFilesOpts,
  type RepoDigest,
} from "./github.digest";
import type { RepoTreeEntry } from "./github.files";

// ingestRepo's own network dependencies, mocked so its per-file truncation
// bookkeeping (F3: docs/grading-results-file-viewer-acceptance-criteria.md)
// can be exercised directly rather than only through selectDigestFiles,
// which never sees a real file BODY (only tree metadata) and so cannot prove
// anything about per-file slicing.
vi.mock("./github.repos", () => ({
  getRepo: vi.fn(),
  ghFetch: vi.fn(),
}));
vi.mock("./github.files", () => ({
  getRepoTreeWithMeta: vi.fn(),
  getFileText: vi.fn(),
}));

import { getRepo } from "./github.repos";
import { getRepoTreeWithMeta, getFileText } from "./github.files";

// The filtering in selectDigestFiles is pure given a tree - no network - so it
// is tested directly here, per docs/folder-scoped-grading-completeness-acceptance-criteria.md.

const blob = (path: string, size = 100, mode?: string): RepoTreeEntry => ({
  path,
  type: "blob",
  size,
  sha: "deadbeef",
  mode,
});

const opts = (overrides: Partial<SelectDigestFilesOpts> = {}): SelectDigestFilesOpts => ({
  maxFiles: DEFAULT_BUDGET.maxFiles,
  maxBytes: DEFAULT_BUDGET.maxBytes,
  perFileBytes: DEFAULT_BUDGET.perFileBytes,
  maxBlobBytes: DEFAULT_BUDGET.maxBlobBytes,
  ...overrides,
});

describe("selectDigestFiles", () => {
  it("includes a subfolder file at depth when scoped to a prefix", () => {
    const tree: RepoTreeEntry[] = [
      blob("week1/src/app/deep/nested/handler.py"),
      blob("week1/README.md"),
      blob("other/skip.py"),
    ];
    const { selected } = selectDigestFiles(tree, opts({ pathPrefix: "week1" }));
    const paths = selected.map((f) => f.path).sort();
    expect(paths).toEqual(["week1/README.md", "week1/src/app/deep/nested/handler.py"]);
  });

  it("includes a no-extension file that is a well-known project file (LICENSE)", () => {
    const tree: RepoTreeEntry[] = [blob("LICENSE"), blob("logo.png")];
    const { selected, skipped } = selectDigestFiles(tree, opts());
    expect(selected.map((f) => f.path)).toEqual(["LICENSE"]);
    // The .png is excluded for type, proving the no-extension fix did not
    // accidentally let non-code artifacts through too.
    expect(skipped.type).toBe(1);
  });

  it("includes an extensionless executable script by its mode bit, and still excludes a .png", () => {
    const tree: RepoTreeEntry[] = [blob("tools/run-checks", 100, "100755"), blob("assets/logo.png", 100)];
    const { selected } = selectDigestFiles(tree, opts());
    expect(selected.map((f) => f.path)).toEqual(["tools/run-checks"]);
  });

  it("excludes an extensionless file with no executable bit and no known name", () => {
    const tree: RepoTreeEntry[] = [blob("data/mystery", 100)];
    const { selected, skipped } = selectDigestFiles(tree, opts());
    expect(selected).toHaveLength(0);
    expect(skipped.type).toBe(1);
  });

  it("treats a dotted directory name correctly - the file has no extension of its own", () => {
    const tree: RepoTreeEntry[] = [blob("my.project/main", 100, "100755"), blob("my.project/main.py", 100)];
    const { selected } = selectDigestFiles(tree, opts());
    // "main" (no extension, but executable) is included via the mode bit;
    // "main.py" is included via its own real extension. Neither incorrectly
    // inherits ".project" from the parent directory as an extension.
    expect(selected.map((f) => f.path).sort()).toEqual(["my.project/main", "my.project/main.py"]);
  });

  it("still excludes a lockfile and a minified bundle", () => {
    const tree: RepoTreeEntry[] = [
      blob("package-lock.json"),
      blob("dist/app.min.js"),
      blob("dist/app.min.js.map"),
      blob("src/index.js"),
    ];
    const { selected, skipped } = selectDigestFiles(tree, opts());
    expect(selected.map((f) => f.path)).toEqual(["src/index.js"]);
    expect(skipped.type).toBe(3);
  });

  it("still excludes node_modules even inside the chosen folder", () => {
    const tree: RepoTreeEntry[] = [
      blob("week1/src/index.js"),
      blob("week1/node_modules/left-pad/index.js"),
      blob("week1/node_modules/left-pad/package.json"),
    ];
    const { selected, skipped } = selectDigestFiles(tree, opts({ pathPrefix: "week1" }));
    expect(selected.map((f) => f.path)).toEqual(["week1/src/index.js"]);
    expect(skipped.type).toBe(2);
  });

  it("the prefixed budget genuinely differs from the unprefixed default", () => {
    expect(SCOPED_BUDGET.maxFiles).toBeGreaterThan(DEFAULT_BUDGET.maxFiles);
    expect(SCOPED_BUDGET.maxBytes).toBeGreaterThan(DEFAULT_BUDGET.maxBytes);
    expect(SCOPED_BUDGET.perFileBytes).toBeGreaterThan(DEFAULT_BUDGET.perFileBytes);
    expect(SCOPED_BUDGET.maxBlobBytes).toBeGreaterThan(DEFAULT_BUDGET.maxBlobBytes);

    // Demonstrate the difference actually changes what gets through: a file
    // that clears the scoped per-blob ceiling but not the default one.
    const tree: RepoTreeEntry[] = [blob("week1/big.py", 100_000)];
    const unscoped = selectDigestFiles(tree, opts({ maxBlobBytes: DEFAULT_BUDGET.maxBlobBytes }));
    const scoped = selectDigestFiles(tree, opts({ maxBlobBytes: SCOPED_BUDGET.maxBlobBytes, pathPrefix: "week1" }));
    expect(unscoped.selected).toHaveLength(0);
    expect(unscoped.skipped.size).toBe(1);
    expect(scoped.selected).toHaveLength(1);
    expect(scoped.skipped.size).toBe(0);
  });

  it("counts skips by type, size, and budget accurately", () => {
    const tree: RepoTreeEntry[] = [
      blob("a.py", 100),
      blob("b.py", 100),
      blob("c.py", 100),
      blob("logo.png", 100), // type
      blob("huge.py", 999), // size
    ];
    const { selected, skipped } = selectDigestFiles(
      tree,
      opts({ maxFiles: 2, maxBytes: 1_000_000, perFileBytes: 1_000, maxBlobBytes: 500 })
    );
    expect(selected).toHaveLength(2);
    expect(skipped.type).toBe(1);
    expect(skipped.size).toBe(1);
    expect(skipped.budget).toBe(1); // the third .py candidate, cut by maxFiles
  });

  it("reports a matched-nothing outcome distinctly from an empty-but-present folder", () => {
    const tree: RepoTreeEntry[] = [blob("week1/README.md"), blob("week2/README.md")];
    const result = selectDigestFiles(tree, opts({ pathPrefix: "week10" }));
    expect(result.prefixMatchedNothing).toBe(true);
    expect(result.selected).toHaveLength(0);
  });

  it("does not let a matching prefix be confused with a longer sibling folder name", () => {
    // week1 must not match week10 - the trailing slash is enforced before comparing.
    const tree: RepoTreeEntry[] = [blob("week10/README.md")];
    const result = selectDigestFiles(tree, opts({ pathPrefix: "week1" }));
    expect(result.prefixMatchedNothing).toBe(true);
  });

  it("prefix match is case-insensitive", () => {
    const tree: RepoTreeEntry[] = [blob("Week1/main.py")];
    const result = selectDigestFiles(tree, opts({ pathPrefix: "week1" }));
    expect(result.prefixMatchedNothing).toBe(false);
    expect(result.selected.map((f) => f.path)).toEqual(["Week1/main.py"]);
  });

  it("a folder with real content (even one small file) is not reported as matched-nothing", () => {
    const tree: RepoTreeEntry[] = [blob("week3/tiny.py", 10)];
    const result = selectDigestFiles(tree, opts({ pathPrefix: "week3" }));
    expect(result.prefixMatchedNothing).toBe(false);
    expect(result.selected).toHaveLength(1);
  });
});

// F3 (docs/grading-results-file-viewer-acceptance-criteria.md): ingestRepo
// must report per-file truncation as a computed FACT, not a hardcoded
// constant - `RepoFile.truncated` is true exactly when that file's own
// content was cut by the byte budget, false when the whole file made it in
// whole. getRepo/getRepoTreeWithMeta/getFileText are mocked (module-level
// above) so this exercises the real slicing logic in ingestRepo itself,
// not just selectDigestFiles's tree-only filtering.
describe("ingestRepo - per-file truncated is computed per file, not guessed", () => {
  const repoInfo = {
    fullName: "org/repo",
    owner: "org",
    name: "repo",
    description: "",
    private: false,
    defaultBranch: "main",
    updatedAt: "",
    htmlUrl: "",
    isTemplate: false,
    archived: false,
  };

  it("a file entirely within perFileBytes is NOT truncated", async () => {
    vi.mocked(getRepo).mockResolvedValue(repoInfo);
    vi.mocked(getRepoTreeWithMeta).mockResolvedValue({
      entries: [{ path: "small.py", type: "blob", size: 50, sha: "s" }],
      truncated: false,
    });
    vi.mocked(getFileText).mockResolvedValue("x".repeat(50));

    const digest = await ingestRepo("org", "repo", { perFileBytes: 8_000, maxBytes: 220_000 });
    expect(digest.files).toHaveLength(1);
    expect(digest.files[0].truncated).toBe(false);
    expect(digest.files[0].content).toBe("x".repeat(50));
    expect(digest.truncated).toBe(false);
  });

  it("a file longer than perFileBytes IS truncated, and the digest-level flag follows it", async () => {
    vi.mocked(getRepo).mockResolvedValue(repoInfo);
    vi.mocked(getRepoTreeWithMeta).mockResolvedValue({
      entries: [{ path: "big.py", type: "blob", size: 20_000, sha: "s" }],
      truncated: false,
    });
    vi.mocked(getFileText).mockResolvedValue("y".repeat(20_000));

    const digest = await ingestRepo("org", "repo", { perFileBytes: 8_000, maxBytes: 220_000 });
    expect(digest.files).toHaveLength(1);
    expect(digest.files[0].truncated).toBe(true);
    expect(digest.files[0].content).toHaveLength(8_000);
    expect(digest.truncated).toBe(true);
  });

  it("two files, only one cut - each file's own flag is independent, not smeared across the digest", async () => {
    vi.mocked(getRepo).mockResolvedValue(repoInfo);
    vi.mocked(getRepoTreeWithMeta).mockResolvedValue({
      entries: [
        { path: "src/short.py", type: "blob", size: 10, sha: "s" },
        { path: "src/long.py", type: "blob", size: 50_000, sha: "s" },
      ],
      truncated: false,
    });
    vi.mocked(getFileText).mockImplementation(async (_owner, _repo, path) =>
      path === "src/short.py" ? "z".repeat(10) : "w".repeat(50_000)
    );

    const digest = await ingestRepo("org", "repo", { perFileBytes: 8_000, maxBytes: 220_000, maxFiles: 40 });
    const short = digest.files.find((f) => f.path === "src/short.py");
    const long = digest.files.find((f) => f.path === "src/long.py");
    expect(short?.truncated).toBe(false);
    expect(long?.truncated).toBe(true);
    // The digest-level aggregate is still true (something was cut), but the
    // per-file flags are what a preview reads, and they must not agree just
    // because the aggregate does.
    expect(digest.truncated).toBe(true);
  });
});

// excludeInstructionsFromDigest - the live defect fix: a folder's README used
// as the assignment INSTRUCTIONS must never also be graded as if it were the
// student's SUBMISSION (see this function's own header comment in
// github.digest.ts). Built here rather than imported from a fixture so the
// exact text format matches what ingestRepo itself produces (asserted below).
function digestOf(
  fullName: string,
  description: string,
  files: Array<{ path: string; content: string; truncated?: boolean }>
): RepoDigest {
  const withDefaults = files.map((f) => ({ path: f.path, content: f.content, truncated: f.truncated ?? false }));
  const header = `# Repository: ${fullName}${description ? `\n\n${description}` : ""}`;
  const text = [header, ...withDefaults.map((f) => `\n\n--- FILE: ${f.path} ---\n${f.content}`)].join("");
  return {
    fullName,
    description,
    fileCount: withDefaults.length,
    text,
    truncated: false,
    files: withDefaults,
    prefixMatchedNothing: false,
    skipped: { type: 0, size: 0, budget: 0, fetchError: 0 },
    treeTruncated: false,
  };
}

describe("excludeInstructionsFromDigest", () => {
  it("removes the file at instructionsPath from files, text, and fileCount together", () => {
    const digest = digestOf("org/repo", "", [
      { path: "week1/README.md", content: "Full worked solution here." },
      { path: "week1/main.py", content: "print(1)" },
    ]);

    const result = excludeInstructionsFromDigest(digest, { instructionsPath: "week1/README.md" });

    expect(result.files.map((f) => f.path)).toEqual(["week1/main.py"]);
    expect(result.fileCount).toBe(1);
    expect(result.text).not.toContain("Full worked solution here.");
    expect(result.text).toContain("week1/main.py");
    // Rebuilt in the exact same format ingestRepo itself uses.
    expect(result.text).toBe("# Repository: org/repo\n\n--- FILE: week1/main.py ---\nprint(1)");
  });

  it("also removes a file by CONTENT match when no path is given - the caller that pre-fetches a README itself", () => {
    const digest = digestOf("org/repo", "", [
      { path: "week1/README.md", content: "Full worked solution here." },
      { path: "week1/main.py", content: "print(1)" },
    ]);

    // Mirrors steps.grading-repos.helpers.ts's resolveReadmeInstructions
    // pattern: the caller fetched the README text itself and passes it as
    // `instructionsText` with no path.
    const result = excludeInstructionsFromDigest(digest, { instructionsText: "Full worked solution here." });

    expect(result.files.map((f) => f.path)).toEqual(["week1/main.py"]);
    expect(result.fileCount).toBe(1);
  });

  it("matches content after trimming surrounding whitespace", () => {
    const digest = digestOf("org/repo", "", [{ path: "README.md", content: "  Instructions.  \n" }]);
    const result = excludeInstructionsFromDigest(digest, { instructionsText: "Instructions." });
    expect(result.files).toHaveLength(0);
  });

  it("returns the SAME digest reference when neither path nor content matches anything", () => {
    const digest = digestOf("org/repo", "", [{ path: "main.py", content: "print(1)" }]);
    const result = excludeInstructionsFromDigest(digest, { instructionsPath: "README.md", instructionsText: "" });
    expect(result).toBe(digest);
  });

  it("never treats an empty/blank instructionsText as a match against an empty file", () => {
    // A digest never actually contains a zero-byte file (ingestRepo skips
    // size<=0 blobs), but this guards the matcher itself: blank instructions
    // text must not accidentally match every file.
    const digest = digestOf("org/repo", "", [{ path: "main.py", content: "print(1)" }]);
    const result = excludeInstructionsFromDigest(digest, { instructionsText: "   " });
    expect(result.files).toHaveLength(1);
  });

  it("removes a file by CONTENT match even when THIS digest truncated it (unscoped/DEFAULT_BUDGET path)", () => {
    // Reproduces the residual defect: on the unscoped workflow path (no
    // pathPrefix -> DEFAULT_BUDGET.perFileBytes = 8_000), a README longer
    // than 8,000 characters is sliced by ingestRepo before it ever reaches
    // this function, while the caller's `instructionsText` was fetched
    // separately, in full, via getFileText. The two strings are no longer
    // byte-identical, so an exact-equality check alone misses this and the
    // instructions leak back into the graded submission.
    const fullReadme = "Full worked solution here. " + "x".repeat(20_000);
    const slicedReadme = fullReadme.slice(0, 8_000);
    expect(slicedReadme.length).toBeLessThan(fullReadme.length);

    const digest = digestOf("org/repo", "", [
      { path: "README.md", content: slicedReadme, truncated: true },
      { path: "main.py", content: "print(1)" },
    ]);

    const result = excludeInstructionsFromDigest(digest, { instructionsText: fullReadme });

    expect(result.files.map((f) => f.path)).toEqual(["main.py"]);
    expect(result.fileCount).toBe(1);
    expect(result.text).not.toContain("Full worked solution here.");
  });

  it("does NOT prefix-match an UNTRUNCATED file that merely shares a leading prefix with the instructions", () => {
    // The prefix rule must stay gated on truncated: true. Without that gate,
    // a legitimately different (but short, coincidentally-prefixed) student
    // file could be wrongly excluded as "the instructions".
    const digest = digestOf("org/repo", "", [
      { path: "week1/main.py", content: "Full worked solution here.", truncated: false },
    ]);

    const result = excludeInstructionsFromDigest(digest, {
      instructionsText: "Full worked solution here. And then some more instructions text.",
    });

    expect(result.files.map((f) => f.path)).toEqual(["week1/main.py"]);
  });

  it("preserves every other field (truncated, skipped, description) unchanged", () => {
    const digest: RepoDigest = {
      ...digestOf("org/repo", "A description.", [
        { path: "README.md", content: "Solution." },
        { path: "main.py", content: "code" },
      ]),
      truncated: true,
      skipped: { type: 1, size: 2, budget: 3, fetchError: 4 },
    };
    const result = excludeInstructionsFromDigest(digest, { instructionsPath: "README.md" });
    expect(result.truncated).toBe(true);
    expect(result.skipped).toEqual({ type: 1, size: 2, budget: 3, fetchError: 4 });
    expect(result.description).toBe("A description.");
    expect(result.fullName).toBe("org/repo");
  });
});

// Dedicated unit tests for isScaffoldingFile - added because a comment in
// github-repos.grading.test.ts asserted these existed when they did not, and
// the function is the shared no-submission floor for BOTH grading paths
// (gradeRepoAction in github-repos.ts and gradeReposAction in app/actions/
// github.ts). Entry 370's Limits record that in production this predicate is
// effectively dead - selectDigestFiles drops 0-byte blobs and isTextCandidate
// rejects extensionless files, so a real .gitkeep never reaches it - which is
// precisely why it needs direct tests: nothing else exercises its actual
// behaviour, and a change here would be invisible to every integration test.
describe("isScaffoldingFile", () => {
  it("is true for .gitkeep, at the repo root and at any depth", () => {
    expect(isScaffoldingFile(".gitkeep")).toBe(true);
    expect(isScaffoldingFile("assignments/module_02/.gitkeep")).toBe(true);
  });

  it("matches on the BASE NAME only, case-insensitively", () => {
    expect(isScaffoldingFile("a/b/.GitKeep")).toBe(true);
    expect(isScaffoldingFile(".GITKEEP")).toBe(true);
  });

  it("is false for a real submission, including files that merely contain the marker", () => {
    expect(isScaffoldingFile("assignments/module_02/calculator.py")).toBe(false);
    expect(isScaffoldingFile("README.md")).toBe(false);
    // A directory named .gitkeep does not make its contents scaffolding.
    expect(isScaffoldingFile(".gitkeep/calculator.py")).toBe(false);
    // Substring, not base name - must not match.
    expect(isScaffoldingFile("my.gitkeep.py")).toBe(false);
    expect(isScaffoldingFile(".gitkeeper")).toBe(false);
  });

  it("is deliberately NOT extended with course-specific scaffolding", () => {
    // The doc comment commits to this: hardcoding one course's layout into
    // every course's grading is the thing this predicate must not do. A
    // future edit that "helpfully" adds these should fail here first.
    expect(isScaffoldingFile("tests/test_module_02.py")).toBe(false);
    expect(isScaffoldingFile("main.py")).toBe(false);
    expect(isScaffoldingFile(".github/workflows/assignment-tests.yml")).toBe(false);
  });

  it("never throws on degenerate input", () => {
    expect(isScaffoldingFile("")).toBe(false);
    expect(isScaffoldingFile("/")).toBe(false);
  });
});
