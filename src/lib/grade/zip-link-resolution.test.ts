import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the resolver MODULES (never global fetch - vitest is network-blocked).
vi.mock("./repo-content", () => ({
  fetchGradableRepoContent: vi.fn(),
}));
vi.mock("./google-drive-content", () => ({
  fetchGoogleDriveFile: vi.fn(),
}));

import { ingestZipEntries } from "./extraction";
import { fetchGradableRepoContent } from "./repo-content";
import { fetchGoogleDriveFile } from "./google-drive-content";
import type { StudentSubmissionEntry } from "./types";
import JSZip from "jszip";

const mockFetchRepo = vi.mocked(fetchGradableRepoContent);
const mockFetchDrive = vi.mocked(fetchGoogleDriveFile);

const GITHUB_GIT = "https://github.com/MikeC21006/applied-ai-4-mike-caps.git";
const VSCODE_BLOB =
  "https://vscode.dev/github/tfuller26-oss/applied-ai-4-Josh-allen/blob/main/Act%202/student_agents/dougdahl_tournament_agent.py";
const GITHUB_BLOB =
  "https://github.com/tfuller26-oss/applied-ai-4-Josh-allen/blob/main/Act%202/student_agents/dougdahl_tournament_agent.py";
const BOILERPLATE = "This submission was a url, we're taking you to the url link now.";

function linkHtml(url: string): string {
  return [
    "<html><head>",
    `<meta http-equiv="Refresh" content="0; url=${url}" />`,
    "</head><body>",
    `<a href="${url}">Click Here to go to the submission</a>`,
    `<p>${BOILERPLATE}</p>`,
    "</body></html>",
  ].join("\n");
}

async function zipOf(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: "arraybuffer" });
}

function entryFor(entries: StudentSubmissionEntry[], fragment: string): StudentSubmissionEntry {
  const found = entries.find((e) => e.student.toLowerCase().includes(fragment));
  if (!found) throw new Error(`no entry for ${fragment}: ${entries.map((e) => e.student).join(", ")}`);
  return found;
}

function okRepo(repo: string, content: string): Awaited<ReturnType<typeof fetchGradableRepoContent>> {
  return { repo, ref: "main", content, truncated: false, fileCount: 1, files: [{ path: "a.py", text: content }] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ingestZipEntries - link.html resolution", () => {
  it("REMOVAL: a GitHub link resolves and its code replaces the redirect boilerplate", async () => {
    mockFetchRepo.mockResolvedValue(okRepo("MikeC21006/applied-ai-4-mike-caps", "print('mike code')"));
    const zip = await zipOf({ "mikecaps_12345_67890_link.html": linkHtml(GITHUB_GIT) });

    const { entries } = await ingestZipEntries(zip);

    expect(mockFetchRepo).toHaveBeenCalledWith(GITHUB_GIT);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toContain("print('mike code')");
    expect(entries[0].content).toContain("GitHub repository code (MikeC21006/applied-ai-4-mike-caps @ main)");
    expect(entries[0].content).not.toContain("This submission was a url");
  });

  it("maps a vscode.dev link to github.com before fetching", async () => {
    mockFetchRepo.mockResolvedValue(okRepo("tfuller26-oss/applied-ai-4-Josh-allen", "josh agent code"));
    const zip = await zipOf({ "joshallen_22222_33333_link.html": linkHtml(VSCODE_BLOB) });

    const { entries } = await ingestZipEntries(zip);

    expect(mockFetchRepo).toHaveBeenCalledTimes(1);
    expect(mockFetchRepo).toHaveBeenCalledWith(GITHUB_BLOB);
    expect(entries[0].content).toContain("josh agent code");
  });

  it("an unknown host becomes a note and is never fetched", async () => {
    const zip = await zipOf({ "ada_1_2_link.html": linkHtml("https://evil.example.com/internal/metadata") });

    const { entries } = await ingestZipEntries(zip);

    expect(mockFetchRepo).not.toHaveBeenCalled();
    expect(mockFetchDrive).not.toHaveBeenCalled();
    expect(entries[0].content).toContain("automatic fetch is not supported for this host");
    expect(entries[0].content).toContain("https://evil.example.com/internal/metadata");
  });

  it("a Google Drive link is detected, noted, and not fetched in this wave", async () => {
    const zip = await zipOf({
      "ada_1_2_link.html": linkHtml("https://drive.google.com/file/d/1AbC_dEf-123/view"),
    });

    const { entries } = await ingestZipEntries(zip);

    expect(mockFetchDrive).not.toHaveBeenCalled();
    expect(mockFetchRepo).not.toHaveBeenCalled();
    expect(entries[0].content).toContain("Google Drive");
  });

  it("a failed fetch isolates to that student; the rest still grade", async () => {
    mockFetchRepo.mockImplementation(async (url: string) =>
      url === GITHUB_GIT ? { error: "could not find the repo" } : okRepo("tfuller26-oss/applied-ai-4-Josh-allen", "josh ok")
    );
    const zip = await zipOf({
      "mikecaps_12345_67890_link.html": linkHtml(GITHUB_GIT),
      "joshallen_22222_33333_link.html": linkHtml(VSCODE_BLOB),
    });

    const { entries } = await ingestZipEntries(zip);

    expect(entries).toHaveLength(2);
    expect(entryFor(entries, "mike").content).toContain("Could not read the linked GitHub repository: could not find the repo.");
    expect(entryFor(entries, "josh").content).toContain("josh ok");
  });

  it("an unexpected rejection from the fetcher also isolates to that student", async () => {
    mockFetchRepo.mockRejectedValueOnce(new Error("boom"));
    const zip = await zipOf({ "mikecaps_12345_67890_link.html": linkHtml(GITHUB_GIT) });

    const { entries } = await ingestZipEntries(zip);

    expect(entries[0].content).toContain("Could not read the linked GitHub repository: boom.");
  });

  it("resolves link files one at a time, never in parallel", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockFetchRepo.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return okRepo("o/r", "code");
    });
    const zip = await zipOf({
      "aaa_1_2_link.html": linkHtml(GITHUB_GIT),
      "bbb_3_4_link.html": linkHtml(VSCODE_BLOB),
      "ccc_5_6_link.html": linkHtml(GITHUB_GIT),
    });

    await ingestZipEntries(zip);

    expect(mockFetchRepo).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
  });

  it("non-hijack: an ordinary html submission with a meta-refresh is left untouched", async () => {
    const ordinary = `<html><head><meta http-equiv="refresh" content="0; url=${GITHUB_GIT}"></head><body>My real page</body></html>`;
    const zip = await zipOf({ "ada_1_2_index.html": ordinary });

    const { entries } = await ingestZipEntries(zip);

    expect(mockFetchRepo).not.toHaveBeenCalled();
    expect(entries[0].content).toContain("My real page");
  });
});
