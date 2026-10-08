import { describe, it, expect } from "vitest";
import { planLinkResolution } from "./link-resolution-plan";

// I-link-plan (BULK-ZIP BW3): the pure per-type verdict. RED if a
// non-allowlisted host maps to a fetch action, or a Google Doc maps to "flag".
describe("planLinkResolution", () => {
  const FETCH_ACTIONS = new Set(["github", "drive-doc", "drive-file"]);

  const table: Array<[string, string, string]> = [
    ["github repo", "https://github.com/octocat/hello-world", "github"],
    ["github .git url", "https://github.com/MikeC21006/applied-ai-4-mike-caps.git", "github"],
    ["vscode.dev github", "https://vscode.dev/github/octocat/hello-world/blob/main/a.py", "github"],
    ["google doc", "https://docs.google.com/document/d/1AbC_dEf-123/edit", "drive-doc"],
    ["drive file", "https://drive.google.com/file/d/1AbC_dEf-123/view", "drive-file"],
    ["google sheet", "https://docs.google.com/spreadsheets/d/1AbC_dEf-123/edit", "flag"],
    ["google slides", "https://docs.google.com/presentation/d/1AbC_dEf-123/edit", "flag"],
    ["drive folder", "https://drive.google.com/drive/folders/1AbC_dEf-123", "flag"],
    ["random host", "https://evil.example.com/internal/metadata", "flag"],
    ["lookalike github host", "https://github.com.evil.example.com/octocat/hello-world", "flag"],
    ["empty", "", "flag"],
  ];

  for (const [label, url, expected] of table) {
    it(`${label} -> ${expected}`, () => {
      expect(planLinkResolution(url).action).toBe(expected);
    });
  }

  it("every flag verdict carries a reason", () => {
    for (const [, url, expected] of table) {
      if (expected === "flag") expect(planLinkResolution(url).reason).toBeTruthy();
    }
  });

  it("never maps an unrecognised host to a fetch action", () => {
    for (const url of ["https://evil.example.com/x", "http://169.254.169.254/latest/meta-data", "https://localhost/a"]) {
      expect(FETCH_ACTIONS.has(planLinkResolution(url).action)).toBe(false);
    }
  });
});
