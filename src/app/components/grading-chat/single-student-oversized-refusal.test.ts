import { describe, expect, it } from "vitest";
import { GRADING_ZIP_MAX_BYTES } from "@/lib/grade/grading-zip-transport";
import { singleStudentOversizedRefusal } from "./oversizedReviewCandidate";

function zip(size: number): File {
  const file = new File(["x"], "submission.zip");
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("single-student oversized ZIP disclosure", () => {
  it("does not claim that an unsupported oversized upload was reviewed or submitted", () => {
    const reason = singleStudentOversizedRefusal([zip(GRADING_ZIP_MAX_BYTES + 1)]);
    expect(reason).toContain("105 MiB");
    expect(reason).toContain("cannot yet be uploaded or reviewed");
    expect(reason).toContain("Nothing was uploaded or graded");
  });

  it("leaves an archive at the limit and non-ZIP files to their existing paths", () => {
    expect(singleStudentOversizedRefusal([zip(GRADING_ZIP_MAX_BYTES)])).toBeNull();
    const document = new File(["x"], "essay.txt");
    Object.defineProperty(document, "size", { value: GRADING_ZIP_MAX_BYTES + 1 });
    expect(singleStudentOversizedRefusal([document])).toBeNull();
  });
});
