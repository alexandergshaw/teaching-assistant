import { expect, it } from "vitest";
import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";
import { indexedBrightspaceGroup } from "./indexedBrightspaceGroup";

it("holds multiple files without complete indexed attempt evidence", () => {
  const group = { label: "1-2", sourceIdentifier: "1-2", members: [{ path: "1-2 - one.txt" }, { path: "1-2 - two.txt" }] } as unknown as RecoverableGroup;
  expect(indexedBrightspaceGroup(group, false).reason).toBe("held for review");
  expect(indexedBrightspaceGroup(group, true, [{ stem: "1-2 - one", submitted: "Nov 5, 2026 735 PM" }]).reason).toBe("held for review");
});
