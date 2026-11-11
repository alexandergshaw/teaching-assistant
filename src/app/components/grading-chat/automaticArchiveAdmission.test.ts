import { expect, it } from "vitest";
import { automaticArchiveAdmission } from "./automaticArchiveAdmission";
import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";

it("auto-submits supported groups while the handoff records held groups", () => {
  const first: RecoverableGroup = { label: "Student A", sourceIdentifier: "1", members: [] };
  const second: RecoverableGroup = { label: "Student B", sourceIdentifier: "2", members: [] };
  expect(automaticArchiveAdmission(true, [first, second], [first, second])).toBe(true);
  expect(automaticArchiveAdmission(false, [first], [first])).toBe(false);
  expect(automaticArchiveAdmission(true, [], [])).toBe(false);
  expect(automaticArchiveAdmission(true, [first, second], [first])).toBe(true);
  const nested: RecoverableGroup = { ...second, reason: "nested archive" };
  expect(automaticArchiveAdmission(true, [first, nested], [first, nested])).toBe(false);
  expect(automaticArchiveAdmission(true, [first, nested], [first, nested], () => true)).toBe(true);
  expect(automaticArchiveAdmission(true, [first, { ...second, reason: "unsupported type" }], [first, second], () => true)).toBe(false);
  expect(automaticArchiveAdmission(true, [first, second], [first, first])).toBe(false);
});
