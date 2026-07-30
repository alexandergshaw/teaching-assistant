import { describe, it, expect } from "vitest";
import { upsertWorkflowDefById, type WorkflowDef } from "./types";

function def(id: string, name = id): WorkflowDef {
  return { id, name, description: "", steps: [] };
}

describe("upsertWorkflowDefById", () => {
  it("appends when no entry has that id yet - the FIRST customization of a preset, which has never appeared in the custom list before", () => {
    const result = upsertWorkflowDefById([def("a")], def("preset-x"));
    expect(result.map((w) => w.id)).toEqual(["a", "preset-x"]);
  });

  it("replaces the existing entry in place (does not reorder) when the id is already present", () => {
    const renamed = def("b", "Renamed B");
    const result = upsertWorkflowDefById([def("a"), def("b"), def("c")], renamed);
    expect(result.map((w) => w.name)).toEqual(["a", "Renamed B", "c"]);
  });

  it("does not mutate the input array", () => {
    const original = [def("a")];
    upsertWorkflowDefById(original, def("b"));
    expect(original.map((w) => w.id)).toEqual(["a"]);
  });
});
