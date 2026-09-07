// TDD suite for mapModuleItem's new_tab read path
// (docs/bulk-open-in-new-tab-acceptance-criteria.md, AC3 / survey
// correction: the field rides the response this app already reads, so this
// is a pure mapping test with no network boundary to mock).

import { describe, it, expect } from "vitest";
import { mapModuleItem } from "./mappers";

describe("mapModuleItem: newTab", () => {
  it("maps a present new_tab: true straight through", () => {
    const item = mapModuleItem({ id: 1, type: "ExternalUrl", external_url: "https://example.edu", new_tab: true }, 5);
    expect(item.newTab).toBe(true);
  });

  it("maps a present new_tab: false straight through - distinct from 'not applicable'", () => {
    const item = mapModuleItem({ id: 1, type: "ExternalUrl", external_url: "https://example.edu", new_tab: false }, 5);
    expect(item.newTab).toBe(false);
  });

  it("maps an OMITTED new_tab key to null, not false - Canvas omits the key rather than sending false for item types the field does not apply to", () => {
    const item = mapModuleItem({ id: 1, type: "Assignment", content_id: 42 }, 5);
    expect(item.newTab).toBeNull();
  });

  it("maps an omitted new_tab key to null for an ExternalTool item too (a row Canvas has not reported the flag for), rather than assuming false", () => {
    const item = mapModuleItem({ id: 1, type: "ExternalTool", external_url: "https://example.edu" }, 5);
    expect(item.newTab).toBeNull();
  });
});
