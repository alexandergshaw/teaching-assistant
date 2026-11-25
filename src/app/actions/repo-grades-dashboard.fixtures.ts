import { createHash } from "node:crypto";
import { vi } from "vitest";
import { ghJson } from "@/lib/github.repos";
import { readPinnedRepoGradeReadme } from "@/lib/repo-grades-dashboard/preparation-readme";

export const templateSha = "c".repeat(40);
export const templateRepo = { repo: "School/Template", branch: "Main" };

export function pinnedTemplate(instructions: string) {
  const path = "assignment/README.md";
  const blobSha = createHash("sha1").update(`blob ${Buffer.byteLength(instructions)}\0`).update(instructions).digest("hex");
  vi.mocked(ghJson).mockImplementation(async (url) => {
    if (url !== `/repos/${templateRepo.repo}/commits/${templateRepo.branch}`) throw new Error(`Unexpected GitHub request ${url}`);
    return { sha: templateSha };
  });
  vi.mocked(readPinnedRepoGradeReadme).mockImplementation(async (target) => ({
    status: "present", target, path, text: instructions, blobSha,
  }));
  return {
    instructions,
    source: {
      kind: "template-readme", path, repo: templateRepo.repo, sourceRef: templateRepo.branch, sourceCommit: templateSha,
      blobSha, readmeStatus: "present", instructionSha256: createHash("sha256").update(instructions).digest("hex"),
    },
  };
}
