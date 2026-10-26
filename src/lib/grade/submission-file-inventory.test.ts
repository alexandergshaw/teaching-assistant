import { describe, expect, it } from "vitest";
import { boundSubmissionInventory, buildRepositoryInventoryBlock, isSubmissionFileInventories, MAX_INVENTORY_BYTES, MAX_INVENTORY_FILES, type SubmissionFileInventory } from "./submission-file-inventory";
const inventory = (files: SubmissionFileInventory["files"]): SubmissionFileInventory => ({ source: "org/repo @ fixed", scope: { kind: "repository", path: null }, enumerationComplete: true, files });
describe("bounded presence evidence", () => {
  it("preserves nested paths, same-basename siblings, exact case, extensionless and unsupported files", () => {
    const value = boundSubmissionInventory(inventory([{ path: "src/Main.py", content: "read" }, { path: "tests/Main.py", content: "unreadable" }, { path: "src/main.py", content: "budget" }, { path: "Makefile", content: "unsupported" }, { path: "proof.png", content: "unsupported" }]));
    expect(value.files.map((file) => file.path)).toEqual(["src/Main.py", "tests/Main.py", "src/main.py", "Makefile", "proof.png"]);
    expect(value.enumerationComplete).toBe(true);
    expect(isSubmissionFileInventories([value])).toBe(true);
    const block = buildRepositoryInventoryBlock([value]);
    expect(block).toContain("Every listed path is known present");
    expect(block).toContain("an unlisted file is unknown");
    expect(block).toContain("out of scope, not missing");
    expect(block).toContain("do not award content credit without evidence");
  });
  it("caps file count without calling the remainder absent", () => {
    const value = boundSubmissionInventory(inventory(Array.from({ length: MAX_INVENTORY_FILES + 1 }, (_, index) => ({ path: index + ".py", content: "read" }))));
    expect(value.files).toHaveLength(MAX_INVENTORY_FILES);
    expect(value.enumerationComplete).toBe(false);
  });
  it("charges UTF8 serialized metadata including the envelope and rejects unsafe names", () => {
    const value = boundSubmissionInventory(inventory(Array.from({ length: 60 }, (_, index) => ({ path: "folder/" + "漢".repeat(1800) + index, content: "unsupported" }))));
    expect(new TextEncoder().encode(JSON.stringify(value)).byteLength).toBeLessThanOrEqual(MAX_INVENTORY_BYTES);
    expect(value.enumerationComplete).toBe(false);
    expect(isSubmissionFileInventories([value])).toBe(true);
    const unsafe = boundSubmissionInventory(inventory([{ path: "../outside.py", content: "read" }, { path: "a\nb.py", content: "read" }]));
    expect(unsafe.files).toEqual([]); expect(unsafe.enumerationComplete).toBe(false);
  });
  it("rejects malformed, incoherent and open wire metadata", () => {
    const valid = inventory([{ path: "Makefile", content: "unsupported" }]);
    for (const bad of [{ ...valid, files: [{ path: "Makefile", content: "binary", text: "bytes" }] }, { ...valid, scope: { kind: "blob", path: null } }, { ...valid, scope: { kind: "tree", path: "src" } }, { ...valid, complete: true }]) expect(isSubmissionFileInventories([bad])).toBe(false);
  });
});

it("requires literal enum strings and preserves exact blob scope", () => {
  const valid: SubmissionFileInventory = { source: "org/repo", scope: { kind: "blob", path: "src/Main.py" }, enumerationComplete: true, files: [{ path: "src/Main.py", content: "read" }] };
  expect(isSubmissionFileInventories([valid])).toBe(true);
  for (const content of [["read"], { value: "read" }, 1, null, true]) expect(isSubmissionFileInventories([{ ...valid, files: [{ path: "src/Main.py", content }] }])).toBe(false);
  for (const kind of [["blob"], ["tree"], { value: "blob" }, 1, null, true]) expect(isSubmissionFileInventories([{ ...valid, scope: { kind, path: "src" }, files: [{ path: "src/sibling.py", content: "read" }] }])).toBe(false);
  expect(isSubmissionFileInventories([{ ...valid, scope: { kind: "blob", path: "src" }, files: [{ path: "src/sibling.py", content: "read" }] }])).toBe(false);
});
