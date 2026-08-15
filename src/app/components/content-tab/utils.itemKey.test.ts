import { describe, expect, it } from "vitest";
import {
  exportItemKey,
  exportModuleKey,
  exportModuleKeyPrefix,
  itemKey,
  liveModuleIdsFromKeys,
  liveModuleKey,
  liveModuleKeyPrefix,
  parseItemKey,
  parseModuleKey,
  repoItemKey,
  repoModuleKey,
  repoModuleKeyPrefix,
} from "./utils";

// itemKey/exportItemKey/repoItemKey/parseItemKey are the discriminated
// selection-key scheme described in utils.ts: "live:<moduleId>:<itemId>" for
// a Canvas item, "export:<moduleRef>:<itemRef>" for an item read from a
// stored course export, "repo:<moduleRef>:<itemRef>" for a folder/file read
// from a paired repo's tree. These are pure string functions - no component
// render involved.

describe("itemKey (live)", () => {
  it("round-trips through parseItemKey with source, moduleRef and itemRef intact", () => {
    const key = itemKey(5, 42);
    expect(key).toBe("live:5:42");
    expect(parseItemKey(key)).toEqual({ source: "live", moduleRef: "5", itemRef: "42" });
  });
});

describe("exportItemKey (export)", () => {
  it("round-trips through parseItemKey with source, moduleRef and itemRef intact", () => {
    const key = exportItemKey("mod-a", "item-b");
    expect(key).toBe("export:mod-a:item-b");
    expect(parseItemKey(key)).toEqual({ source: "export", moduleRef: "mod-a", itemRef: "item-b" });
  });

  it("round-trips an itemRef that itself contains the ':' delimiter, via the trailing-segment split", () => {
    const key = exportItemKey("modA", "res:with:colons");
    expect(parseItemKey(key)).toEqual({ source: "export", moduleRef: "modA", itemRef: "res:with:colons" });
  });
});

describe("repoItemKey (repo)", () => {
  it("round-trips through parseItemKey with source, moduleRef and itemRef intact", () => {
    const key = repoItemKey("assignments/module_01", "README.md");
    expect(key).toBe("repo:assignments/module_01:README.md");
    expect(parseItemKey(key)).toEqual({
      source: "repo",
      moduleRef: "assignments/module_01",
      itemRef: "README.md",
    });
  });

  it("round-trips a slash-heavy repo item ref, since a repo path is slashes not colons", () => {
    const key = repoItemKey("assignments/module_01", "assignments/module_01/src/main/App.java");
    expect(parseItemKey(key)).toEqual({
      source: "repo",
      moduleRef: "assignments/module_01",
      itemRef: "assignments/module_01/src/main/App.java",
    });
  });
});

describe("live vs export never collide", () => {
  it("produces different keys for numerically identical refs across the two sources", () => {
    const live = itemKey(1, 2);
    const exported = exportItemKey("1", "2");
    expect(live).not.toBe(exported);
    expect(live).toBe("live:1:2");
    expect(exported).toBe("export:1:2");
  });

  it("parses each back to its own source rather than the other", () => {
    expect(parseItemKey(itemKey(1, 2))?.source).toBe("live");
    expect(parseItemKey(exportItemKey("1", "2"))?.source).toBe("export");
  });
});

describe("liveModuleKeyPrefix", () => {
  it("distinguishes module 1 from module 12 - a numeric prefix must not collide", () => {
    // "live:12:7" must not start with the prefix built for module 1, or a
    // module-1 prune would also sweep up module 12's key.
    expect("live:12:7".startsWith(liveModuleKeyPrefix(1))).toBe(false);
    expect("live:1:5".startsWith(liveModuleKeyPrefix(1))).toBe(true);
    // And the mirror: module 1's key must not start with module 12's prefix.
    expect("live:1:5".startsWith(liveModuleKeyPrefix(12))).toBe(false);
    expect("live:12:7".startsWith(liveModuleKeyPrefix(12))).toBe(true);
  });
});

describe("parseItemKey malformed input", () => {
  it("returns null without throwing for a variety of malformed keys", () => {
    expect(() => parseItemKey("")).not.toThrow();
    expect(parseItemKey("")).toBeNull();
    expect(parseItemKey("garbage")).toBeNull(); // no colon at all
    expect(parseItemKey("live:5")).toBeNull(); // missing itemId segment
    expect(parseItemKey("live::5")).toBeNull(); // empty moduleRef
    expect(parseItemKey("live:5:")).toBeNull(); // empty itemRef
    expect(parseItemKey("unknown:5:42")).toBeNull(); // unrecognized source
    expect(parseItemKey(":5:42")).toBeNull(); // empty source
  });

  it("still rejects a source token that isn't live, export or repo, after the repo source was added", () => {
    expect(parseItemKey("bogus:1:2")).toBeNull();
  });

  it("accepts the new repo source", () => {
    expect(parseItemKey("repo:1:2")).toEqual({ source: "repo", moduleRef: "1", itemRef: "2" });
  });
});

// liveModuleKey/exportModuleKey/parseModuleKey mirror the item-key scheme
// above for the MODULE-selection Set: "live:<id>" for a Canvas module,
// "export:<ref>" for a module read from a stored course export. Built
// because a CartridgeModule carries no numeric id at all (only an optional
// string `identifier`), so the old `Set<number>` selectedModules used could
// not represent an export-sourced module selection - not merely unwired,
// UNTYPEABLE.

describe("liveModuleKey (live)", () => {
  it("round-trips through parseModuleKey with source and ref intact", () => {
    const key = liveModuleKey(5);
    expect(key).toBe("live:5");
    expect(parseModuleKey(key)).toEqual({ source: "live", ref: "5" });
  });
});

describe("exportModuleKey (export)", () => {
  it("round-trips through parseModuleKey with source and ref intact", () => {
    const key = exportModuleKey("mod-a");
    expect(key).toBe("export:mod-a");
    expect(parseModuleKey(key)).toEqual({ source: "export", ref: "mod-a" });
  });

  it("round-trips a ref that itself contains the ':' delimiter, via the trailing-segment split", () => {
    const key = exportModuleKey("res:with:colons");
    expect(parseModuleKey(key)).toEqual({ source: "export", ref: "res:with:colons" });
  });
});

describe("repoModuleKey (repo)", () => {
  it("round-trips through parseModuleKey with source and ref intact", () => {
    const key = repoModuleKey("assignments/module_01");
    expect(key).toBe("repo:assignments/module_01");
    expect(parseModuleKey(key)).toEqual({ source: "repo", ref: "assignments/module_01" });
  });
});

describe("repoModuleKeyPrefix", () => {
  it("distinguishes a folder from another folder whose name merely starts with the same characters", () => {
    // Real repo shape (docs/repo-pairing-in-modules-acceptance-criteria.md):
    // assignments/module_01 .. assignments/module_16, unpadded also possible
    // ("module_1" vs "module_12") - the string "module_1" is a literal prefix
    // of "module_12", so without the trailing separator a prune for module_1
    // would also sweep up module_12's item keys.
    const item12 = repoItemKey("assignments/module_12", "README.md");
    const item1 = repoItemKey("assignments/module_1", "README.md");
    expect(item12.startsWith(repoModuleKeyPrefix("assignments/module_1"))).toBe(false);
    expect(item1.startsWith(repoModuleKeyPrefix("assignments/module_1"))).toBe(true);
    // And the mirror: module_1's key must not start with module_12's prefix.
    expect(item1.startsWith(repoModuleKeyPrefix("assignments/module_12"))).toBe(false);
    expect(item12.startsWith(repoModuleKeyPrefix("assignments/module_12"))).toBe(true);
  });
});

describe("live vs export module keys never collide", () => {
  it("produces different keys for numerically identical refs across the two sources", () => {
    const live = liveModuleKey(1);
    const exported = exportModuleKey("1");
    expect(live).not.toBe(exported);
    expect(live).toBe("live:1");
    expect(exported).toBe("export:1");
  });

  it("parses each back to its own source rather than the other", () => {
    expect(parseModuleKey(liveModuleKey(1))?.source).toBe("live");
    expect(parseModuleKey(exportModuleKey("1"))?.source).toBe("export");
  });

  it("a Set holding both never conflates them - exact-string membership, not a prefix match", () => {
    // The module-selection Set itself (unlike the item-key pruning helpers)
    // uses plain Set.has/.delete, which is always exact-string equality in
    // JS - this pins that liveModuleKey(1) and liveModuleKey(12) really are
    // distinct entries, not a case where one happens to be a prefix of the
    // other in a way that could matter.
    const keys = new Set([liveModuleKey(1), liveModuleKey(12), exportModuleKey("1")]);
    expect(keys.has(liveModuleKey(1))).toBe(true);
    expect(keys.has(liveModuleKey(12))).toBe(true);
    expect(keys.size).toBe(3);
  });
});

describe("liveModuleKey/liveModuleKeyPrefix stay in sync", () => {
  it("liveModuleKeyPrefix(id) is always a prefix of the item key built under liveModuleKey's own module", () => {
    expect(itemKey(5, 42).startsWith(liveModuleKeyPrefix(5))).toBe(true);
    expect(liveModuleKey(5)).toBe("live:5");
    expect(liveModuleKeyPrefix(5)).toBe("live:5:");
  });
});

describe("exportModuleKeyPrefix", () => {
  it("distinguishes module ref '1' from '12' - a string prefix must not collide", () => {
    expect("export:12:i7".startsWith(exportModuleKeyPrefix("1"))).toBe(false);
    expect("export:1:i5".startsWith(exportModuleKeyPrefix("1"))).toBe(true);
    expect("export:1:i5".startsWith(exportModuleKeyPrefix("12"))).toBe(false);
    expect("export:12:i7".startsWith(exportModuleKeyPrefix("12"))).toBe(true);
  });
});

describe("parseModuleKey malformed input", () => {
  it("returns null without throwing for a variety of malformed keys", () => {
    expect(() => parseModuleKey("")).not.toThrow();
    expect(parseModuleKey("")).toBeNull();
    expect(parseModuleKey("garbage")).toBeNull(); // no colon at all
    expect(parseModuleKey("live:")).toBeNull(); // empty ref
    expect(parseModuleKey("unknown:5")).toBeNull(); // unrecognized source
    expect(parseModuleKey(":5")).toBeNull(); // empty source
  });

  it("still rejects a source token that isn't live, export or repo, after the repo source was added", () => {
    expect(parseModuleKey("bogus:5")).toBeNull();
  });

  it("accepts the new repo source", () => {
    expect(parseModuleKey("repo:assignments/module_01")).toEqual({
      source: "repo",
      ref: "assignments/module_01",
    });
  });
});

describe("liveModuleIdsFromKeys", () => {
  it("extracts only the LIVE numeric ids, dropping export-sourced keys silently", () => {
    const keys = [liveModuleKey(1), exportModuleKey("m1"), liveModuleKey(12)];
    expect(liveModuleIdsFromKeys(keys)).toEqual(new Set([1, 12]));
  });

  it("returns an empty Set for an all-export or empty input", () => {
    expect(liveModuleIdsFromKeys([exportModuleKey("m1")])).toEqual(new Set());
    expect(liveModuleIdsFromKeys([])).toEqual(new Set());
  });

  it("also drops repo-sourced keys silently, same as export-sourced ones", () => {
    const keys = [liveModuleKey(1), repoModuleKey("assignments/module_01"), liveModuleKey(12)];
    expect(liveModuleIdsFromKeys(keys)).toEqual(new Set([1, 12]));
  });

  it("ignores a malformed key rather than throwing", () => {
    expect(() => liveModuleIdsFromKeys(["garbage", "live:5"])).not.toThrow();
    expect(liveModuleIdsFromKeys(["garbage", "live:5"])).toEqual(new Set([5]));
  });
});
