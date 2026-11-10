import { describe, expect, it, vi } from "vitest";
import { groupMultipleFiles, markSessionChanged, suggestFileGroups, submitAssignedFiles, submitDropBatch, submitOneFileGroup } from "./submissionDropRoutes";

const file = (name: string) => new File(["submission"], name);

describe("file drop routing", () => {
  it.each(["submission.pdf", "submission.docx", "recording.mp4"])("uses the existing single-file transport and inference for %s", async (name) => {
    const upload = file(name);
    const submitFiles = vi.fn().mockResolvedValue([{ kind: "accepted", entryCount: 1 }]);
    const submitComposite = vi.fn();
    expect(await submitOneFileGroup("", [upload], submitFiles, submitComposite)).toEqual({ kind: "accepted", entryCount: 1 });
    expect(submitFiles).toHaveBeenCalledWith([upload], undefined);
    expect(submitComposite).not.toHaveBeenCalled();
  });

  it("uses composite cardinality checks for a one-student ZIP or several files", async () => {
    const submitFiles = vi.fn();
    const submitComposite = vi.fn().mockResolvedValue({ kind: "refused", reason: "more than one student's submission" });
    const zip = file("class.ZIP"), pdf = file("part.pdf"), docx = file("part.docx");
    expect(await submitOneFileGroup("Alex", [zip], submitFiles, submitComposite)).toMatchObject({ kind: "refused" });
    await submitOneFileGroup("Alex", [pdf, docx], submitFiles, submitComposite);
    expect(submitFiles).not.toHaveBeenCalled();
    expect(submitComposite.mock.calls).toEqual([
      ["Alex", [{ kind: "file", file: zip }]],
      ["Alex", [{ kind: "file", file: pdf }, { kind: "file", file: docx }]],
    ]);
  });

  it("holds matching names and timestamps, including possible different students, until assigned", async () => {
    const files = [file("Alice_2025-01-01_120000_part1.pdf"), file("Alice_2025-01-01_120000_part2.docx"),
      file("Bob_2025-01-01_130000_work.pdf"), file("assignment.pdf"), file("class.zip")];
    const submitOne = vi.fn();
    const submitMany = vi.fn().mockResolvedValue([{ kind: "accepted", entryCount: 2 }]);
    const results = await submitDropBatch("many", "", files, submitOne, submitMany);
    expect(results.map((result) => result.kind)).toEqual(["identity", "identity", "identity", "identity", "accepted"]);
    expect(submitOne).not.toHaveBeenCalled();
    expect(submitMany).toHaveBeenCalledWith([files[4]]);
    expect(groupMultipleFiles(files).ambiguous).toEqual([0, 1, 2, 3]);
  });
  it("holds real timestamp and synthetic user-and-sequence filenames without inferring identity", async () => {
    const files = [file("Alice_2025-01-01_120000_part1.pdf"), file("Alice_2025-01-01_120000_part2.docx"),
      file("Alice_101_1_first.pdf"), file("Alice_101_2_second.pdf"), file("paper.pdf")];
    const submitOne = vi.fn();
    const result = await submitDropBatch("many", "", files, submitOne, vi.fn());
    expect(result.map((entry) => entry.kind)).toEqual(["identity", "identity", "identity", "identity", "identity"]);
    expect(submitOne).not.toHaveBeenCalled();
    expect(groupMultipleFiles(files).ambiguous).toEqual([0, 1, 2, 3, 4]);
  });
  it("proposes synthetic multipart together while separating different identifiers", async () => {
    const files = [file("Alice_101_1_a.pdf"), file("Alice_101_2_b.pdf"), file("Alice_102_1_c.pdf"), file("unknown.pdf")];
    const suggestions = suggestFileGroups(files);
    expect(suggestions).toEqual(["Alice (101)", "Alice (101)", "Alice (102)", ""]);
    const submitOne = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 });
    const results = await submitAssignedFiles(files.slice(0, 2), suggestions.slice(0, 2), submitOne);
    expect(results.map((entry) => entry.kind)).toEqual(["accepted", "accepted"]);
    expect(submitOne).toHaveBeenCalledWith("Alice (101)", files.slice(0, 2));
  });

  it("exposes same-name and timestamp collisions as unverified groups for review", () => {
    expect(suggestFileGroups([file("Alice_2025-01-01_120000_a.pdf"), file("Alice_2025-01-01_120000_b.pdf"), file("Alice_2025-01-02_120000_c.pdf")]))
      .toEqual(["Alice (2025-01-01_120000)", "Alice (2025-01-01_120000)", "Alice (2025-01-02_120000)"]);
  });
  it("only dispatches reviewed suggestions when explicitly accepted, without combining distinct groups", async () => {
    const files = [file("Alice_101_1_a.pdf"), file("Alice_101_2_b.pdf"), file("Alice_102_1_c.pdf")];
    const submitOne = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 });
    const held = await submitDropBatch("many", "", files, submitOne, vi.fn());
    expect(held.map((entry) => entry.kind)).toEqual(["identity", "identity", "identity"]);
    const suggestions = suggestFileGroups(files);
    expect(submitOne).not.toHaveBeenCalled();
    await submitAssignedFiles(files, suggestions, submitOne);
    expect(submitOne.mock.calls).toEqual([["Alice (101)", files.slice(0, 2)], ["Alice (102)", [files[2]]]]);
  });
  it("stops dispatching later groups when the session resets during an earlier group", async () => {
    let current = true;
    let finish!: (value: { kind: "accepted"; entryCount: number }) => void;
    const submitOne = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const files = [file("a.pdf"), file("b.pdf")];
    const pending = submitAssignedFiles(files, ["Alice", "Bob"], submitOne, () => current);
    current = false;
    finish({ kind: "accepted", entryCount: 1 });
    const outcomes = await pending;
    expect(submitOne).toHaveBeenCalledTimes(1);
    expect(outcomes[0]).toMatchObject({ kind: "unknown", reason: expect.stringContaining("session changed") });
    expect(outcomes[1]).toMatchObject({ kind: "refused", reason: expect.stringContaining("Session changed") });
  });
  it("marks previously accepted rows unconfirmed after a session change", () => {
    expect(markSessionChanged({ kind: "accepted", entryCount: 1 })).toMatchObject({ kind: "unknown", reason: expect.stringContaining("session changed") });
    expect(markSessionChanged({ kind: "refused", reason: "not sent" })).toEqual({ kind: "refused", reason: "not sent" });
  });
  it("grades explicitly assigned files for the same student together", async () => {
    const files = [file("first.pdf"), file("second.docx"), file("unknown.pdf")];
    const submitOne = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 });
    const result = await submitAssignedFiles(files, ["Alice", "Alice", ""], submitOne);
    expect(result.map((entry) => entry.kind)).toEqual(["accepted", "accepted", "identity"]);
    expect(submitOne).toHaveBeenCalledOnce();
    expect(submitOne).toHaveBeenCalledWith("Alice", files.slice(0, 2));
  });

  it("marks missing or thrown outcomes unknown without resubmitting", async () => {
    const files = [file("Alice_2025-01-01_120000_a.pdf"), file("class.zip")];
    const submitOne = vi.fn().mockRejectedValue(new Error("connection lost"));
    const submitMany = vi.fn().mockResolvedValue([]);
    expect((await submitDropBatch("one", " Alex ", files, submitOne, submitMany)).map((result) => result.kind)).toEqual(["unknown", "unknown"]);
    expect(submitOne).toHaveBeenCalledTimes(1);
    expect((await submitDropBatch("many", "", files, submitOne, submitMany)).map((result) => result.kind)).toEqual(["identity", "unknown"]);
    expect(submitMany).toHaveBeenCalledTimes(1);
  });

  it("retains unsupported multipart video and over-budget groups without dispatch", async () => {
    const submitFiles = vi.fn(), submitComposite = vi.fn();
    const video = file("video.mp4"), doc = file("paper.pdf");
    expect(await submitOneFileGroup("Alex", [video, doc], submitFiles, submitComposite)).toMatchObject({ kind: "refused", reason: expect.stringContaining("does not yet support video") });
    Object.defineProperty(doc, "size", { value: 4_000_000 });
    expect(await submitOneFileGroup("Alex", [doc, file("other.pdf")], submitFiles, submitComposite)).toMatchObject({ kind: "refused", reason: expect.stringContaining("too large") });
    expect(submitFiles).not.toHaveBeenCalled(); expect(submitComposite).not.toHaveBeenCalled();
  });
});

it("routes an oversized single ZIP to review even in one-student mode", async () => {
  const zip = new File(["synthetic"], "archive.zip"); Object.defineProperty(zip, "size", { value: 282_107_616 });
  const submitFiles = vi.fn(async () => [{ kind: "refused" as const, reason: "Opened oversized ZIP review. Nothing was submitted." }]); const composite = vi.fn();
  expect(await submitOneFileGroup("Synthetic", [zip], submitFiles, composite)).toMatchObject({ kind: "refused", reason: expect.stringContaining("review") });
  expect(submitFiles).toHaveBeenCalledWith([zip]); expect(composite).not.toHaveBeenCalled();
});
