import { describe, it, expect } from "vitest";
import {
  parseResourceItems,
  sourcesVisitedBlock,
  boundVisitedSources,
  MAX_VISITED_SOURCES_IN_PROMPT,
  MAX_VISITED_SOURCE_URI_LENGTH,
  oxfordJoin,
  kindProseList,
  kindSchemaAlternation,
} from "./resource-item-parsing";
import type { Source } from "@/lib/llm";

function source(uri: string, title = "T"): Source {
  return { title, uri };
}

describe("parseResourceItems - source-index rule", () => {
  it("replaces the item's url with the resolved source when \"source\" is a valid in-range integer", () => {
    const text = JSON.stringify({
      items: [{ title: "A", url: "https://model-wrote-this.test/x", kind: "doc", whatYouGet: "help", source: 0 }],
    });
    const [item] = parseResourceItems(text, 4, ["https://resolved.test/page"]);
    expect(item.url).toBe("https://resolved.test/page");
  });

  it("leaves the model's own url when \"source\" is absent, null, out of range, or a stringified number", () => {
    const sourceUrls = ["https://resolved.test/page"];
    const cases = [
      {},
      { source: null },
      { source: 99 },
      { source: "0" },
      { source: -1 },
      { source: 1.5 },
    ];
    for (const extra of cases) {
      const text = JSON.stringify({
        items: [{ title: "A", url: "https://model-own-url.test/x", kind: "doc", whatYouGet: "help", ...extra }],
      });
      const [item] = parseResourceItems(text, 4, sourceUrls);
      expect(item.url).toBe("https://model-own-url.test/x");
    }
  });
});

describe("boundVisitedSources - cap and length limit", () => {
  it("keeps at most MAX_VISITED_SOURCES_IN_PROMPT entries", () => {
    const sources = Array.from({ length: MAX_VISITED_SOURCES_IN_PROMPT + 5 }, (_, i) =>
      source(`https://site${i}.test/page`, `Site ${i}`)
    );
    const bounded = boundVisitedSources(sources);
    expect(bounded).toHaveLength(MAX_VISITED_SOURCES_IN_PROMPT);
    expect(bounded).toEqual(sources.slice(0, MAX_VISITED_SOURCES_IN_PROMPT));
  });

  it("drops a source whose uri is over MAX_VISITED_SOURCE_URI_LENGTH characters, renumbering the survivors contiguously", () => {
    const hugeUri = "https://oversized.test/" + "a".repeat(3000);
    expect(hugeUri.length).toBeGreaterThan(MAX_VISITED_SOURCE_URI_LENGTH);

    const sources = [source("https://ok-one.test/page", "Ok One"), source(hugeUri, "Huge"), source("https://ok-two.test/page", "Ok Two")];
    const bounded = boundVisitedSources(sources);

    expect(bounded.map((s) => s.uri)).toEqual(["https://ok-one.test/page", "https://ok-two.test/page"]);

    // The block built from the bounded list numbers contiguously from 0 -
    // the oversized uri never appears anywhere in the prompt text, and the
    // second surviving source is "1", not "2" (which would leave a gap the
    // model could still write for the dropped entry).
    const block = sourcesVisitedBlock(bounded);
    expect(block).not.toContain(hugeUri);
    expect(block).toContain("0. Ok One - https://ok-one.test/page");
    expect(block).toContain("1. Ok Two - https://ok-two.test/page");
    expect(block).not.toMatch(/2\. /);
  });

  it("a 3 KB uri dropped by boundVisitedSources can never be selected by parseResourceItems, since the same bounded list backs both", () => {
    const hugeUri = "https://oversized.test/" + "b".repeat(3000);
    const sources = [source("https://ok.test/page", "Ok"), source(hugeUri, "Huge")];
    const bounded = boundVisitedSources(sources);
    const sourceUrls = bounded.map((s) => s.uri);

    expect(sourceUrls).not.toContain(hugeUri);

    // A model that (incorrectly) still writes index 1 for the dropped entry
    // finds nothing there - out of range against the bounded list - so its
    // own url is left untouched, never replaced with the oversized uri.
    const text = JSON.stringify({
      items: [{ title: "A", url: "https://model-own-url.test/x", kind: "doc", whatYouGet: "help", source: 1 }],
    });
    const [item] = parseResourceItems(text, 4, sourceUrls);
    expect(item.url).toBe("https://model-own-url.test/x");
    expect(item.url).not.toContain(hugeUri);
  });
});

describe("sourcesVisitedBlock", () => {
  it("returns an empty string for an empty list", () => {
    expect(sourcesVisitedBlock([])).toBe("");
  });

  it("numbers entries from 0 and includes title/uri", () => {
    const block = sourcesVisitedBlock([source("https://a.test/1", "A"), source("https://b.test/2", "B")]);
    expect(block).toContain("0. A - https://a.test/1");
    expect(block).toContain("1. B - https://b.test/2");
  });
});

describe("oxfordJoin / kindProseList / kindSchemaAlternation - shape sanity", () => {
  it("joins with an Oxford comma for three or more items", () => {
    expect(oxfordJoin(["a", "b", "c"])).toBe("a, b, or c");
  });

  it("kindProseList quotes each kind and Oxford-joins them", () => {
    expect(kindProseList(["doc", "video", "tutorial"])).toBe('"doc", "video", or "tutorial"');
  });

  it("kindSchemaAlternation pipe-joins the raw kinds", () => {
    expect(kindSchemaAlternation(["doc", "video", "tutorial"])).toBe("doc|video|tutorial");
  });
});
