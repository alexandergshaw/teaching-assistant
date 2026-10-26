import { describe, expect, it, vi } from "vitest";
import { createChatFileRolesController } from "./useChatFileRoles";
import type { ConfirmedRoleSetup } from "./chatFileRoles";
import type { SubmitOutcome } from "./useContinuousGradingRun";
const options = { harshness: "strict" as const, feedbackWordTarget: 80, applyNamingDeduction: false, applyLengthDeduction: true };
function setup() {
  const start = vi.fn<(setup: ConfirmedRoleSetup, current: () => boolean) => Promise<boolean>>(async () => true), submit = vi.fn<(file: File, label: string | undefined, current: () => boolean) => Promise<SubmitOutcome>>(async () => ({ kind: "accepted", entryCount: 1 })), applySetup = vi.fn();
  const params = { epoch: "session-1", locked: false, draft: { instructions: "TYPED", rubric: "RUBRIC" }, options, start, submit, applySetup };
  const controller = createChatFileRolesController(params); return { controller, params, start, submit, applySetup };
}
describe("role controller real callbacks", () => {
  it("stages unknown roles without work, captures setup/options once and never sends setup files", async () => {
    const s = setup(), assignment = new File(["ASSIGNMENT_ONLY_SENTINEL"], "assignment.txt"), rubric = new File(["Correctness (12 pts): behavior"], "rubric.txt"), zip = new File(["zip"], "class.zip");
    s.controller.snapshot().stage([assignment, rubric, zip]);
    expect(s.controller.snapshot().rows.map((row) => row.role)).toEqual(["unassigned", "unassigned", "unassigned"]); await s.controller.snapshot().confirm(); expect(s.start).not.toHaveBeenCalled();
    const rows = s.controller.snapshot().rows; await s.controller.snapshot().assign(rows[0].id, "instructions"); await s.controller.snapshot().assign(rows[1].id, "rubric"); await s.controller.snapshot().assign(rows[2].id, "submission");
    s.controller.snapshot().choose("instructions", "file"); s.controller.snapshot().choose("rubric", "file");
    await Promise.all([s.controller.snapshot().confirm(), s.controller.snapshot().confirm()]);
    expect(s.start).toHaveBeenCalledTimes(1); expect(s.start.mock.calls[0][0]).toEqual({ instructions: "ASSIGNMENT_ONLY_SENTINEL", rubric: "Correctness (12 pts): behavior", ...options });
    expect(s.submit).toHaveBeenCalledTimes(1); expect(s.submit.mock.calls[0][0]).toBe(zip);
    expect(s.controller.snapshot().rows.every((row) => row.file === null)).toBe(true);
  });
  it("keeps duplicate filenames distinct, consumes accepted/partial files and retries failures without resending success", async () => {
    const s = setup(); const submit = vi.fn().mockResolvedValueOnce({ kind: "accepted", entryCount: 1 }).mockRejectedValueOnce(new Error("private error")).mockResolvedValueOnce({ kind: "partial", dispatchedCount: 1, refusedCount: 1, reason: "one refused" }).mockResolvedValue({ kind: "accepted", entryCount: 1 });
    s.controller.sync({ ...s.params, submit }); s.controller.snapshot().stage([new File(["a"], "same.txt"), new File(["b"], "same.txt"), new File(["c"], "same.txt")]);
    for (const row of s.controller.snapshot().rows) await s.controller.snapshot().assign(row.id, "submission");
    await s.controller.snapshot().confirm(); expect(s.controller.snapshot().rows.map((row) => row.status)).toEqual(["accepted", "failed", "partial"]);
    await s.controller.snapshot().confirm(); expect(submit).toHaveBeenCalledTimes(4); expect(s.controller.snapshot().rows.map((row) => row.id)).toEqual([1, 2, 3]);
  });
  it("rejects a second batch without replacing the first, allows setup-only draft application with no start", async () => {
    const s = setup(); const first = new File(["SETUP"], "setup.md"); s.controller.snapshot().stage([first]);
    expect(s.controller.snapshot().stage([new File(["second"], "second.txt")])).toBe(false); expect(s.controller.snapshot().rows[0].file).toBe(first);
    await s.controller.snapshot().assign(1, "combined"); s.controller.snapshot().choose("instructions", "file"); s.controller.snapshot().choose("rubric", "file"); await s.controller.snapshot().confirm(true);
    expect(s.start).not.toHaveBeenCalled(); expect(s.submit).not.toHaveBeenCalled(); expect(s.applySetup).toHaveBeenCalledWith(expect.objectContaining({ instructions: "SETUP", rubric: "SETUP" })); expect(s.controller.snapshot().pending).toBe(false);
  });
  it("discards an old setup read after role change/cancel and a late start after reset", async () => {
    const s = setup(); let finish!: (buffer: ArrayBuffer) => void;
    const slow = { name: "old.txt", size: 3, arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { finish = resolve; }) } as File;
    s.controller.snapshot().stage([slow]); const read = s.controller.snapshot().assign(1, "instructions"); await Promise.resolve();
    const change = s.controller.snapshot().assign(1, "exclude"); finish(new TextEncoder().encode("OLD").buffer); await Promise.all([read, change]); expect(s.controller.snapshot().rows[0].text).toBeUndefined();
    s.controller.snapshot().cancel(); s.controller.snapshot().stage([new File(["a"], "student.txt")]); await s.controller.snapshot().assign(2, "submission");
    let ready!: (value: boolean) => void; s.start.mockImplementationOnce(() => new Promise<boolean>((resolve) => { ready = resolve; }));
    const confirm = s.controller.snapshot().confirm(); s.controller.sync({ ...s.params, epoch: "session-2" }); ready(true); await confirm;
    expect(s.submit).not.toHaveBeenCalled(); expect(s.controller.snapshot().pending).toBe(false); expect(s.controller.snapshot().busy).toBe(false);
  });
  it("refused setup retains all unattempted files and locked sessions cannot designate setup", async () => {
    const s = setup(); s.start.mockResolvedValueOnce(false); s.controller.snapshot().stage([new File(["a"], "student.txt")]); await s.controller.snapshot().assign(1, "submission");
    await s.controller.snapshot().confirm(); expect(s.submit).not.toHaveBeenCalled(); expect(s.controller.snapshot().rows[0].status).toBe("unattempted"); expect(s.controller.snapshot().rows[0].file).not.toBeNull();
    s.controller.sync({ ...s.params, locked: true }); await s.controller.snapshot().assign(1, "instructions"); expect(s.controller.snapshot().rows[0].role).toBe("submission"); expect(s.controller.snapshot().error).toContain("New session");
  });
});
