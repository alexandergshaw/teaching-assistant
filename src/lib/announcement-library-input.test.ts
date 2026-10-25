import { describe, it, expect } from "vitest";
import { parseAnnouncementLibraryInput, isAnnouncementLibraryUuid } from "./announcement-library-input";

const valid = { id: "11111111-1111-4111-8111-111111111111", courseId: "22222222-2222-4222-8222-222222222222",
  exemplarText: "  Hello class  ", label: " Weekly ", expected: null };
describe("announcement library validation", () => {
  it("normalizes only desired labels while preserving body and exact legacy expected snapshots", () => {
    const expected = { exemplarText: "old", label: " legacy " };
    expect(parseAnnouncementLibraryInput({ ...valid, expected })).toEqual({ ...valid, label: "Weekly", expected });
    expect(parseAnnouncementLibraryInput({ ...valid, label: "  " })?.label).toBeNull();
  });
  it("enforces character and UTF-8 byte bounds without truncation", () => {
    expect(parseAnnouncementLibraryInput({ ...valid, exemplarText: "a".repeat(16000) })).not.toBeNull();
    expect(parseAnnouncementLibraryInput({ ...valid, exemplarText: "a".repeat(16001) })).toBeNull();
    expect(parseAnnouncementLibraryInput({ ...valid, exemplarText: "界".repeat(11000) })).toBeNull();
    expect(parseAnnouncementLibraryInput({ ...valid, label: "a".repeat(120) })).not.toBeNull();
    expect(parseAnnouncementLibraryInput({ ...valid, label: "a".repeat(121) })).toBeNull();
  });
  it("rejects malformed identifiers, empty bodies and malformed snapshots", () => {
    for (const input of [null, {}, { ...valid, id: "foreign" }, { ...valid, courseId: null },
      { ...valid, exemplarText: "\n " }, { ...valid, label: 2 }, { ...valid, expected: {} },
      { ...valid, expected: { exemplarText: "old", label: 3 } }, { ...valid, expected: undefined }]) {
      expect(parseAnnouncementLibraryInput(input)).toBeNull();
    }
    expect(isAnnouncementLibraryUuid("id.eq.anything")).toBe(false);
  });
  it("bounds legacy expected snapshots separately without changing their contents", () => {
    const expected = { exemplarText: "界".repeat(80_000), label: " legacy ".repeat(100) };
    expect(parseAnnouncementLibraryInput({ ...valid, expected })?.expected).toEqual(expected);
    expect(parseAnnouncementLibraryInput({ ...valid, expected: { ...expected, exemplarText: "a".repeat(262145) } })).toBeNull();
    expect(parseAnnouncementLibraryInput({ ...valid, expected: { ...expected, exemplarText: "界".repeat(87382) } })).toBeNull();
    expect(parseAnnouncementLibraryInput({ ...valid, expected: { ...expected, label: "a".repeat(1025) } })).toBeNull();
  });
});
