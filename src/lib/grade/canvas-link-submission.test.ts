import { describe, it, expect } from "vitest";
import { extractCanvasSubmittedUrl, normalizeSubmittedRepoUrl } from "./canvas-link-submission";

// Frozen oracle: the two REAL submission URLs from the owner's sample zip,
// written as literals (a different source than the parser under test).
const GITHUB_GIT = "https://github.com/MikeC21006/applied-ai-4-mike-caps.git";
const VSCODE_BLOB =
  "https://vscode.dev/github/tfuller26-oss/applied-ai-4-Josh-allen/blob/main/Act%202/student_agents/dougdahl_tournament_agent.py";
const GITHUB_BLOB =
  "https://github.com/tfuller26-oss/applied-ai-4-Josh-allen/blob/main/Act%202/student_agents/dougdahl_tournament_agent.py";

const MARKER = "This submission was a url, we're taking you to the url link now.";

function page(url: string, opts: { meta?: boolean; href?: boolean; marker?: boolean } = {}): string {
  const { meta = true, href = true, marker = true } = opts;
  return [
    "<html><head>",
    "<title>Assignment 4: Some Student</title>",
    meta ? `<meta http-equiv="Refresh" content="0; url=${url}" />` : "",
    "</head><body>",
    href ? `<a href="${url}">Click Here to go to the submission</a>` : "",
    marker ? `<p>${MARKER}</p>` : "",
    "</body></html>",
  ].join("\n");
}

describe("extractCanvasSubmittedUrl - real fixtures", () => {
  it("extracts the github .git url from meta-refresh", () => {
    expect(extractCanvasSubmittedUrl(page(GITHUB_GIT))).toBe(GITHUB_GIT);
  });
  it("extracts the vscode.dev blob url verbatim (Act%202 preserved)", () => {
    expect(extractCanvasSubmittedUrl(page(VSCODE_BLOB))).toBe(VSCODE_BLOB);
  });
});

describe("extractCanvasSubmittedUrl - wrapper variants", () => {
  it("falls back to the href when there is no meta-refresh", () => {
    expect(extractCanvasSubmittedUrl(page(GITHUB_GIT, { meta: false }))).toBe(GITHUB_GIT);
    expect(extractCanvasSubmittedUrl(page(VSCODE_BLOB, { meta: false }))).toBe(VSCODE_BLOB);
  });
  it("accepts meta-refresh alone (no anchor)", () => {
    expect(extractCanvasSubmittedUrl(page(GITHUB_GIT, { href: false }))).toBe(GITHUB_GIT);
  });
  it("is case-insensitive on tag, attribute and keyword names", () => {
    const html = `<META HTTP-EQUIV="REFRESH" CONTENT="0; URL=${GITHUB_GIT}"><p>THIS SUBMISSION WAS A URL</p>`;
    expect(extractCanvasSubmittedUrl(html)).toBe(GITHUB_GIT);
  });
  it("tolerates whitespace, single quotes and content-before-http-equiv", () => {
    const html = `<meta content='  0 ;  url = ${GITHUB_GIT}  ' http-equiv = 'refresh'><p>${MARKER}</p>`;
    expect(extractCanvasSubmittedUrl(html)).toBe(GITHUB_GIT);
  });
  it("decodes &amp; in the url", () => {
    const html = `<meta http-equiv="refresh" content="0; url=https://github.com/o/r?a=1&amp;b=2"><p>${MARKER}</p>`;
    expect(extractCanvasSubmittedUrl(html)).toBe("https://github.com/o/r?a=1&b=2");
  });
});

describe("extractCanvasSubmittedUrl - negatives (anti-hijack)", () => {
  it("returns null without the marker even when the target is a resolvable host", () => {
    expect(extractCanvasSubmittedUrl(page(GITHUB_GIT, { marker: false }))).toBeNull();
    expect(extractCanvasSubmittedUrl(page(VSCODE_BLOB, { marker: false }))).toBeNull();
  });
  it("returns null for an ordinary html submission", () => {
    expect(
      extractCanvasSubmittedUrl("<html><body><h1>My portfolio</h1><a href=\"https://example.com\">x</a></body></html>")
    ).toBeNull();
  });
  it("returns null for a marker page with no usable url", () => {
    expect(extractCanvasSubmittedUrl(`<html><body><p>${MARKER}</p></body></html>`)).toBeNull();
  });
  it("rejects a non-http scheme target", () => {
    const html = `<meta http-equiv="refresh" content="0; url=javascript:alert(1)"><p>${MARKER}</p>`;
    expect(extractCanvasSubmittedUrl(html)).toBeNull();
  });
  it("returns null for empty input", () => {
    expect(extractCanvasSubmittedUrl("")).toBeNull();
  });
});

describe("normalizeSubmittedRepoUrl", () => {
  it("rewrites vscode.dev/github blob urls to github.com, preserving Act%202", () => {
    expect(normalizeSubmittedRepoUrl(VSCODE_BLOB)).toBe(GITHUB_BLOB);
  });
  it("rewrites a vscode.dev repo-root url to a repo url", () => {
    expect(normalizeSubmittedRepoUrl("https://vscode.dev/github/owner/repo")).toBe("https://github.com/owner/repo");
  });
  it("passes a plain github.com .git url through unchanged", () => {
    expect(normalizeSubmittedRepoUrl(GITHUB_GIT)).toBe(GITHUB_GIT);
  });
  it("passes a non-github host and a non-github vscode.dev path through unchanged", () => {
    expect(normalizeSubmittedRepoUrl("https://example.com/github/a/b")).toBe("https://example.com/github/a/b");
    expect(normalizeSubmittedRepoUrl("https://vscode.dev/other/a/b")).toBe("https://vscode.dev/other/a/b");
  });
  it("returns unparseable input unchanged", () => {
    expect(normalizeSubmittedRepoUrl("http://")).toBe("http://");
  });
});
