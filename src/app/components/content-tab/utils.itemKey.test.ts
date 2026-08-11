import { describe, expect, it } from "vitest";
import { exportItemKey, itemKey, liveModuleKeyPrefix, parseItemKey } from "./utils";

// itemKey/exportItemKey/parseItemKey are the discriminated selection-key
// scheme described in utils.ts: "live:<moduleId>:<itemId>" for a Canvas item,
// "export:<moduleRef>:<itemRef>" for an item read from a stored course
// export. These are pure string functions - no component render involved.

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
});
