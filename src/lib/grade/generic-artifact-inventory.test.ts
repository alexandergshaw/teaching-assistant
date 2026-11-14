import { describe, expect, it } from "vitest";
import { genericArtifactInventory } from "./generic-artifact-inventory";

const file = (path: string, value: string | Uint8Array) => ({ path, bytes: typeof value === "string" ? new TextEncoder().encode(value) : value });

describe("generic artifact inventory text classification", () => {
  it("keeps CSV, TSV, module scripts and verified extensionless project files as text", () => {
    expect(genericArtifactInventory([
      file("lab/data.csv", "name,value\nAda,1\n"), file("lab/data.tsv", "name\tvalue\nAda\t1\n"),
      file("lab/main.mjs", "console.log('ok')"), file("lab/main.cjs", "console.log('ok')"),
      file("lab/Makefile", "all:\n\techo ok\n"), file("lab/Dockerfile", "FROM node:22\n"),
    ])).toEqual([]);
  });

  it("holds binary-like and invalid UTF-8 bytes even with an accepted text name", () => {
    const result = genericArtifactInventory([
      file("lab/data.csv", new Uint8Array([0x4d, 0x5a, 0, 1])),
      file("lab/data.tsv", new Uint8Array([0xff, 0xfe])),
      file("lab/Makefile", new Uint8Array([0x41, 1, 0x42])),
      file("lab/Dockerfile", "%PDF-1.7\n"),
      file("lab/main.mjs", new Uint8Array([0x50, 0x4b, 3, 4])),
    ]);
    expect(result.map(({ path, kind }) => [path, kind])).toEqual([
      ["lab/data.csv", "pe"], ["lab/data.tsv", "binary"],
      ["lab/Makefile", "unsupported-source"], ["lab/Dockerfile", "unsupported-source"], ["lab/main.mjs", "archive"],
    ]);
  });

  it("does not assume unknown extensionless files are project text", () => {
    expect(genericArtifactInventory([file("lab/mystery", "plain content")])).toMatchObject([{ kind: "unsupported-source" }]);
  });
});
