import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the resolver MODULES (never global fetch - vitest is network-blocked).
vi.mock("./repo-content", () => ({
  fetchGradableRepoContent: vi.fn(),
}));
vi.mock("./google-drive-content", () => ({
  fetchGoogleDriveFile: vi.fn(),
}));

import { ingestZipEntries, resolveEntryLinks, MAX_ENTRY_CONTENT_CHARS } from "./extraction";
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

const DOC_URL = "https://docs.google.com/document/d/1AbC_dEf-123/edit";
const DRIVE_FILE_URL = "https://drive.google.com/file/d/1AbC_dEf-123/view";
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AbC_dEf-123/edit";

function linkEntry(url: string): StudentSubmissionEntry {
  return {
    student: "ada",
    content: `File: link.html\n\nSubmitted link: ${url}`,
    mergedFileCount: 1,
    submittedFiles: [],
    submissionUrl: url,
  };
}

describe("ingestZipEntries - deferLinks (BW3 ingest half)", () => {
  // Convention-prefixed names (name_id_id_file) so the citation-name keying is
  // exercised: a flat-named fixture would false-pass a path-keyed map.
  it("I-defer-ingest: no fetch at ingest; each link student carries submissionUrl + a bare note", async () => {
    const zip = await zipOf({
      "ada_1_2_link.html": linkHtml(GITHUB_GIT),
      "bob_3_4_link.html": linkHtml(DOC_URL),
      "cy_5_6_main.py": "print('cy')",
    });

    const { entries } = await ingestZipEntries(zip, { deferLinks: true });

    expect(mockFetchRepo).not.toHaveBeenCalled();
    expect(mockFetchDrive).not.toHaveBeenCalled();
    const ada = entryFor(entries, "ada");
    const bob = entryFor(entries, "bob");
    const cy = entryFor(entries, "cy");
    expect(ada.submissionUrl).toBe(GITHUB_GIT);
    expect(ada.content).toContain(`Submitted link: ${GITHUB_GIT}`);
    expect(bob.submissionUrl).toBe(DOC_URL);
    expect(bob.content).toContain(`Submitted link: ${DOC_URL}`);
    expect(cy.submissionUrl).toBeUndefined();
  });

  it("I-defer-collision: one student with two link files that strip alike gets NO url and a flag", async () => {
    const zip = await zipOf({
      "a/ada_1_2_link.html": linkHtml(GITHUB_GIT),
      "b/ada_9_9_link.html": linkHtml(VSCODE_BLOB),
      "bob_3_4_link.html": linkHtml(DOC_URL),
    });

    const { entries } = await ingestZipEntries(zip, { deferLinks: true });

    const ada = entryFor(entries, "ada");
    expect(ada.submissionUrl).toBeUndefined();
    expect(ada.repoReadNote).toContain("could not be matched to a single student");
    expect(ada.linkFetch).toBe("flagged");
    // The other student is unaffected and never receives ada's URL.
    expect(entryFor(entries, "bob").submissionUrl).toBe(DOC_URL);
    expect(entries.filter((e) => e.submissionUrl === GITHUB_GIT || e.submissionUrl === VSCODE_BLOB)).toHaveLength(0);
  });

  it("I-defer-off-unchanged: with deferLinks absent the link resolves inline and no submissionUrl is set", async () => {
    mockFetchRepo.mockResolvedValue(okRepo("MikeC21006/applied-ai-4-mike-caps", "print('mike code')"));
    const zip = await zipOf({ "mikecaps_12345_67890_link.html": linkHtml(GITHUB_GIT) });

    const { entries } = await ingestZipEntries(zip);

    expect(mockFetchRepo).toHaveBeenCalledTimes(1);
    expect(entries[0].content).toContain("print('mike code')");
    expect(entries[0].submissionUrl).toBeUndefined();
  });

  it("an ordinary html submission is untouched under deferLinks", async () => {
    const ordinary = `<html><head><meta http-equiv="refresh" content="0; url=${GITHUB_GIT}"></head><body>My real page</body></html>`;
    const zip = await zipOf({ "ada_1_2_index.html": ordinary });

    const { entries } = await ingestZipEntries(zip, { deferLinks: true });

    expect(entries[0].submissionUrl).toBeUndefined();
    expect(entries[0].content).toContain("My real page");
  });
});

describe("resolveEntryLinks (BW3 grade-time resolver)", () => {
  it("I-resolve-at-grade: a GitHub link folds the repo code and records the repo", async () => {
    mockFetchRepo.mockResolvedValue(okRepo("MikeC21006/applied-ai-4-mike-caps", "print('mike code')"));

    const out = await resolveEntryLinks(linkEntry(GITHUB_GIT));

    expect(mockFetchRepo).toHaveBeenCalledWith(GITHUB_GIT);
    expect(out.content).toContain("print('mike code')");
    expect(out.content).toContain(`Submitted link: ${GITHUB_GIT}`);
    expect(out.gradedRepo).toBe("MikeC21006/applied-ai-4-mike-caps");
    expect(out.gradedRef).toBe("main");
    expect(out.linkFetch).toBe("ok");
  });

  it("I-resolve-at-grade: a vscode.dev link is mapped to github.com before fetching", async () => {
    mockFetchRepo.mockResolvedValue(okRepo("o/r", "josh code"));
    await resolveEntryLinks(linkEntry(VSCODE_BLOB));
    expect(mockFetchRepo).toHaveBeenCalledWith(GITHUB_BLOB);
  });

  it("I-resolve-at-grade: a Google Doc link folds the exported document text", async () => {
    mockFetchDrive.mockResolvedValue({ name: "essay.txt", buffer: Buffer.from("the doc body text") });

    const out = await resolveEntryLinks(linkEntry(DOC_URL));

    expect(mockFetchDrive).toHaveBeenCalledWith({ kind: "native-doc", docType: "document", id: "1AbC_dEf-123" });
    expect(out.content).toContain("the doc body text");
    expect(out.linkFetch).toBe("ok");
    expect(out.mergedFileCount).toBe(2);
  });

  it("I-resolve-never-throws: a failing GitHub fetch keeps the bare note and sets failed", async () => {
    mockFetchRepo.mockResolvedValue({ error: "could not find the repo" });
    const out = await resolveEntryLinks(linkEntry(GITHUB_GIT));
    expect(out.linkFetch).toBe("failed");
    expect(out.content).toContain(`Submitted link: ${GITHUB_GIT}`);
    expect(out.repoReadNote).toContain("could not find the repo");
  });

  it("I-resolve-never-throws: a rejecting Drive fetch does not throw and sets failed", async () => {
    mockFetchDrive.mockRejectedValue(new Error("drive exploded"));
    const out = await resolveEntryLinks(linkEntry(DOC_URL));
    expect(out.linkFetch).toBe("failed");
    expect(out.content).toContain(`Submitted link: ${DOC_URL}`);
    expect(out.repoReadNote).toContain("drive exploded");
  });

  it("I-resolve-never-throws: a Drive error result keeps the bare note and sets failed", async () => {
    mockFetchDrive.mockResolvedValue({ error: "not publicly shared" });
    const out = await resolveEntryLinks(linkEntry(DOC_URL));
    expect(out.linkFetch).toBe("failed");
    expect(out.repoReadNote).toContain("not publicly shared");
  });

  it("flags Sheets and an unknown host without fetching", async () => {
    for (const url of [SHEET_URL, "https://evil.example.com/internal/metadata"]) {
      const out = await resolveEntryLinks(linkEntry(url));
      expect(out.linkFetch).toBe("flagged");
      expect(out.content).toContain(`Submitted link: ${url}`);
      expect(out.repoReadNote).toContain("link not fetched");
    }
    expect(mockFetchRepo).not.toHaveBeenCalled();
    expect(mockFetchDrive).not.toHaveBeenCalled();
  });

  it("I-resolve-single-entry: a Drive file that is a multi-student zip is flagged, never blended", async () => {
    const archive = await zipOf({ "ann_1_2_a.py": "print('ann')", "bob_3_4_a.py": "print('bob')" });
    mockFetchDrive.mockResolvedValue({ name: "bundle.zip", buffer: Buffer.from(archive) });

    const out = await resolveEntryLinks(linkEntry(DRIVE_FILE_URL));

    expect(out.linkFetch).toBe("flagged");
    expect(out.content).not.toContain("print('ann')");
    expect(out.content).not.toContain("print('bob')");
    expect(out.content).toContain(`Submitted link: ${DRIVE_FILE_URL}`);
    expect(out.mergedFileCount).toBe(1);
  });

  it("I-reclamp: folded content over the cap is clamped", async () => {
    mockFetchRepo.mockResolvedValue(okRepo("o/r", "x".repeat(MAX_ENTRY_CONTENT_CHARS + 5_000)));
    const out = await resolveEntryLinks(linkEntry(GITHUB_GIT));
    expect(out.content.length).toBeLessThanOrEqual(MAX_ENTRY_CONTENT_CHARS);
    expect(out.linkFetch).toBe("ok");
  });

  it("an entry with no submissionUrl is returned unchanged and gets no linkFetch", async () => {
    const plain: StudentSubmissionEntry = { student: "ada", content: "text", mergedFileCount: 1, submittedFiles: [] };
    const out = await resolveEntryLinks(plain);
    expect(out).toBe(plain);
    expect(out.linkFetch).toBeUndefined();
  });

  it("a Canvas-path entry whose read already failed (repoReadNote set) is not refetched", async () => {
    const failed: StudentSubmissionEntry = { ...linkEntry(GITHUB_GIT), gradedRepo: null, repoReadNote: "Could not read it." };
    const out = await resolveEntryLinks(failed);
    expect(out).toBe(failed);
    expect(mockFetchRepo).not.toHaveBeenCalled();
  });

  it("an already-resolved Canvas-path entry is not fetched twice", async () => {
    const done: StudentSubmissionEntry = { ...linkEntry(GITHUB_GIT), gradedRepo: "o/r", gradedRef: "main" };
    const out = await resolveEntryLinks(done);
    expect(out).toBe(done);
    expect(mockFetchRepo).not.toHaveBeenCalled();
  });
});
