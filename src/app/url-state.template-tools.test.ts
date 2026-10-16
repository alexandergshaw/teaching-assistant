import { describe, it, expect } from "vitest";
import { normalizePresentationsView, parseUrlState, buildUrlSearch } from "./url-state";
import { getActiveDestinationId, getDestinationById, getInnerDestinations, resolveStateFromDestinationId } from "./components/manual/manual-rail";
describe("template tools share presentations URL navigation", () => {
  for (const view of ["ppt-templates", "document-templates"] as const) {
    it(view + " survives URL serialization, direct load and history snapshots", () => {
      const state = parseUrlState("?tab=manual&manualView=presentations&presentationsView=" + view);
      expect(state.presentationsView).toBe(view);
      expect(normalizePresentationsView(view)).toBe(view);
      const snapshot = buildUrlSearch(state);
      expect(parseUrlState(snapshot)).toEqual(state);
      const slideDeckSnapshot = buildUrlSearch({ ...state, presentationsView: "slide-deck" });
      expect(parseUrlState(slideDeckSnapshot).presentationsView).toBe("slide-deck");
      expect(parseUrlState(snapshot).presentationsView).toBe(view);
      const id = "presentations-" + view;
      expect(getDestinationById(id)?.label).toBe(view === "ppt-templates" ? "PowerPoint Templates" : "Document Templates");
      expect(getActiveDestinationId("presentations", "new", "modules", "chat", view)).toBe(id);
      expect(resolveStateFromDestinationId(id, "content", "new", "modules", "chat").presentationsView).toBe(view);
      expect(getInnerDestinations("presentations")?.map(d => d.id)).toContain(id);
    });
  }
  it("still normalizes unknown views safely", () => expect(normalizePresentationsView("invented")).toBe("slide-deck"));
});
