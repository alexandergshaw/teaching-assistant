import { describe, expect, it, vi } from "vitest";
import {
  applyRepoGradeCompletion,
  applyRetainedRepoGradeDraftEdit,
  getRepoGradeCellEdit,
  setRepoGradeCellEdit,
  type RepoGradeCellEditsByRepo,
} from "./repoGradesCellEdits";
import { createRepoGradesDraftController } from "./repoGradesDraftController";
import { REPO_GRADE_SESSION_SAVE_FAILURE } from "./repoGradesDraftSession";
import { clearRepoGradeCellsIn, persistRepoGradeCellsTo, readRepoGradeCellsFrom } from "./repoGradesResultsStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup() {
  const key = "key";
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => { raw = value; },
    removeItem: () => { raw = null; },
  };
  const write = (id: string, edits: RepoGradeCellEditsByRepo, expected?: RepoGradeCellEditsByRepo) =>
    persistRepoGradeCellsTo(storage, key, id, edits, "now", undefined, expected);
  const restore = vi.fn((id: string) => readRepoGradeCellsFrom(storage, key, id));
  const save = vi.fn<(id: string, edits: RepoGradeCellEditsByRepo, expected: RepoGradeCellEditsByRepo) => string | null | Promise<string | null>>(write);
  const discard = vi.fn((id: string) => clearRepoGradeCellsIn(storage, key, id));
  const drafts = createRepoGradesDraftController("account", { restore, save, discard });
  const view = () => drafts.getSnapshot()!;
  const score = (value: string, scope = view().scope) => drafts.edit(scope, (edits) => setRepoGradeCellEdit(edits, "repo", "folder", { score: value }));
  const cell = () => getRepoGradeCellEdit(view().edits, "repo", "folder");
  const seed = (id: string, value: string) => write(id, setRepoGradeCellEdit({}, "repo", "folder", { score: value }));
  return { drafts, view, score, cell, restore, save, discard, write, seed };
}

describe("Repo Grades draft controller used by the grading view", () => {
  it("records current and retained feedback before the save effect and rejects the old course callbacks", async () => {
    const { drafts, view, score, cell, seed, write, restore, save } = setup();
    seed("B", "4");
    const current = setRepoGradeCellEdit({}, "repo", "folder", { score: "6", draftRevision: 1 });
    write("A", applyRepoGradeCompletion(current, "repo", "folder", 0, { score: "8", generatedScore: "8" }));
    const staleEdit = vi.fn((edits: RepoGradeCellEditsByRepo) => edits);
    drafts.edit({}, staleEdit);
    expect(staleEdit).not.toHaveBeenCalled();

    drafts.select("A");
    const a = view().scope;
    score("7");
    const retained = cell().retainedResults![0];
    drafts.edit(a, (edits) => applyRetainedRepoGradeDraftEdit(edits, "repo", "folder", retained, "strengths", "reviewed"));
    drafts.select("B");
    await drafts.save(a);
    expect(cell().score).toBe("4");
    expect(save).not.toHaveBeenCalled();
    drafts.select("A");
    expect(view().scope).not.toBe(a);
    expect(drafts.isCurrent(a)).toBe(false);
    drafts.edit(a, staleEdit);
    expect(staleEdit).not.toHaveBeenCalled();
    expect(cell()).toMatchObject({ score: "7", retainedResults: [{ source: { score: "8" }, draft: { strengths: "reviewed" } }] });
    expect(restore.mock.calls).toEqual([["A"], ["B"]]);
    await drafts.save(view().scope);
    expect(restore("A").edits.repo.folder).toMatchObject({ score: "7", retainedResults: [{ draft: { strengths: "reviewed" } }] });
  });

  it("preserves a save refusal across switches and only saves again for a newer edit", async () => {
    const { drafts, view, score, cell, save, seed, restore } = setup();
    seed("A", "original");
    drafts.select("A");
    score("failed draft");
    save.mockReturnValueOnce("Storage refused");
    await drafts.save(view().scope);
    drafts.select("B");
    drafts.select("A");
    expect(cell().score).toBe("failed draft");
    expect(view()).toMatchObject({ saveNotice: REPO_GRADE_SESSION_SAVE_FAILURE, saveDue: false });
    await drafts.save(view().scope);
    expect(save).toHaveBeenCalledTimes(1);
    score("newer draft");
    await drafts.save(view().scope);
    expect(save.mock.calls[1][2].repo.folder.score).toBe("original");
    expect(restore("A").edits.repo.folder.score).toBe("newer draft");
    expect(view().saveNotice).toBeNull();
  });

  it("keeps the original baseline after a conflicting browser write", async () => {
    const { drafts, view, score, cell, seed, restore, save } = setup();
    seed("A", "original");
    drafts.select("A");
    seed("A", "saved by another view");
    score("first local draft");
    await drafts.save(view().scope);
    drafts.select("B");
    drafts.select("A");
    score("later local draft");
    await drafts.save(view().scope);
    expect(save.mock.calls.map(([, , baseline]) => baseline.repo.folder.score)).toEqual(["original", "original"]);
    expect(restore("A").edits.repo.folder.score).toBe("saved by another view");
    expect(cell().score).toBe("later local draft");
    expect(view().saveNotice).toBe(REPO_GRADE_SESSION_SAVE_FAILURE);
  });

  it("waits for an acknowledged normalized baseline while retaining newer live edits", async () => {
    const { drafts, view, score, cell, seed, write, restore, save, discard } = setup();
    seed("A", "original");
    const pending = deferred<string | null>();
    save.mockImplementationOnce((id, edits, expected) => {
      expect(write(id, edits, expected)).toBeNull();
      return pending.promise;
    });
    drafts.select("A");
    const a = view().scope;
    drafts.edit(a, (edits) => setRepoGradeCellEdit(edits, "repo", "folder", { score: "first", grading: true, postStatus: "posting" }));
    const firstSave = drafts.save(a);
    drafts.select("B");
    drafts.select("A");
    expect(cell()).toMatchObject({ score: "first", grading: false, postStatus: "error" });
    score("second");
    const returned = view().scope;
    expect(view()).toMatchObject({ savePending: true, saveDue: false });
    expect(drafts.discard(returned)).toBe(false);
    expect(discard).not.toHaveBeenCalled();
    await drafts.save(returned);
    expect(save).toHaveBeenCalledTimes(1);
    const confirmed = restore("A").edits;
    pending.resolve(null);
    await firstSave;
    expect(cell().score).toBe("second");
    expect(view()).toMatchObject({ savePending: false, saveDue: true });
    await drafts.save(returned);
    expect(save.mock.calls[1][2]).toEqual(confirmed);
    expect(restore("A").edits.repo.folder.score).toBe("second");
  });

  it("does not save on failed restore, uncertain write, or successful discard", async () => {
    const { drafts, view, score, cell, restore, save, discard } = setup();
    restore.mockReturnValueOnce({ edits: {}, notice: "Read refused.", result: { outcome: "failed", failureCategory: "storage_unavailable" } });
    drafts.select("A");
    const a = view().scope;
    expect(view().restoredNotice).toContain("Edits are available while Repo Grades stays open.");
    await drafts.save(a);
    score("session only");
    await drafts.save(a);
    expect(save).not.toHaveBeenCalled();
    discard.mockReturnValueOnce({ notice: "Discard refused.", result: { outcome: "failed", failureCategory: "storage_unavailable" } });
    expect(drafts.discard(a)).toBe(false);
    drafts.select("B");
    drafts.select("A");
    expect(cell().score).toBe("session only");
    expect(view().discardNotice).toBe("Discard refused.");
    expect(drafts.discard(view().scope)).toBe(true);
    await drafts.save(view().scope);
    expect(save).not.toHaveBeenCalled();
    expect(view()).toMatchObject({ edits: {}, restoredNotice: null, discardNotice: null, saveNotice: null });
    score("uncertain");
    save.mockRejectedValueOnce(new Error("Write outcome unavailable"));
    await drafts.save(view().scope);
    score("unsaved after uncertainty");
    await drafts.save(view().scope);
    expect(save).toHaveBeenCalledTimes(1);
    expect(view().saveNotice).toBe(REPO_GRADE_SESSION_SAVE_FAILURE);
  });

  it("revokes pending results and wipes drafts when the mount lifetime ends", async () => {
    const { drafts, view, score, cell, save, seed } = setup();
    seed("A", "original");
    const pending = deferred<string | null>();
    save.mockReturnValueOnce(pending.promise);
    drafts.select("A");
    const a = view().scope;
    score("old draft");
    const completion = drafts.save(a);
    drafts.reset();
    expect(drafts.getSnapshot()).toBeNull();
    expect(drafts.isCurrent(a)).toBe(false);
    drafts.select("A");
    expect(cell().score).toBe("original");
    pending.resolve("Old failure");
    await completion;
    expect(view()).toMatchObject({ saveNotice: null, saveDue: false, savePending: false });
  });
});
