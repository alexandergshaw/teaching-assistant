import { describe, expect, it } from "vitest";
import type { TreeEntry } from "@/lib/github-verified-tree";
import { provenEmptyFolders, provenTextRecoveryFolders } from "./empty-folders";

const sha = "a".repeat(40);
const emptySha = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";
const file = (path: string, mode: "100644" | "100755" | "120000" = "100644"): TreeEntry => ({ path, mode, sha: emptySha, size: 0 });

describe("provenEmptyFolders", () => {
  it("recognizes only regular .gitkeep files, including nested placeholders", () => {
    expect(provenEmptyFolders(["empty", "work", "link", "nested"], [
      file("empty/.gitkeep"), file("work/.gitkeep"), file("work/a.xyz"),
      file("link/.gitkeep", "120000"), file("nested/deeper/.gitkeep"),
    ])).toEqual(["empty", "nested"]);
  });
  it("does not infer absence from no evidence or a submodule", () => {
    expect(provenEmptyFolders(["missing", "sub"], [{ path: "sub/vendor", mode: "160000", sha }])).toEqual([]);
  });
  it("treats nonempty placeholder blobs as possible work even if their size is misreported", () => {
    expect(provenEmptyFolders(["lab"], [{ path: "lab/.gitkeep", mode: "100644", sha, size: 0 }])).toEqual([]);
  });
});

describe("provenTextRecoveryFolders", () => {
  it("selects only folders with regular newly supported text or extensionless files", () => {
    expect(provenTextRecoveryFolders(["text", "nested", "code", "hidden", "readme", "link"], [
      file("text/answer.TEXT"), file("nested/deep/schema"), file("code/main.py"),
      file("hidden/.env"), file("readme/README.md"), file("link/schema", "120000"),
    ])).toEqual(["text", "nested"]);
  });

  it("does not match a sibling folder with a shared prefix", () => {
    expect(provenTextRecoveryFolders(["lab", "lab2"], [file("lab2/schema")])).toEqual(["lab2"]);
  });
});
