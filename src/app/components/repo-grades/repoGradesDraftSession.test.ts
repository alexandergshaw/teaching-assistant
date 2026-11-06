import { describe, expect, it } from "vitest";
import { defaultRepoGradeCellEdit, type RepoGradeCellEdit } from "./repoGradesCellEdits";
import {
  createRepoGradesDraftSession,
  REPO_GRADE_SESSION_SAVE_FAILURE,
} from "./repoGradesDraftSession";
import { loadRepoGradeCellsFrom, persistRepoGradeCellsTo } from "./repoGradesResultsStore";

function edits(patch: Partial<RepoGradeCellEdit>) {
  return { repo: { folder: { ...defaultRepoGradeCellEdit(), ...patch } } };
}

function openCourse() {
  const session = createRepoGradesDraftSession();
  const scope = session.activate("account", "lifetime", "A")!;
  session.initialize(scope, edits({ score: "saved" }));
  return { session, scope };
}

describe("Repo Grades draft session", () => {
  it("keeps authorized edits when a course switch happens before the save effect", () => {
    const { session, scope } = openCourse();
    session.recordEdit(scope, edits({ score: "typed" }));

    const other = session.activate("account", "lifetime", "B")!;
    session.initialize(other, edits({ score: "other course" }));
    expect(session.read(other)?.liveEdits).toEqual(edits({ score: "other course" }));
    expect(session.beginSave(scope)).toBeUndefined();

    const returned = session.activate("account", "lifetime", "A")!;
    expect(returned).not.toBe(scope);
    session.initialize(returned, edits({ score: "loaded again" }));
    expect(session.read(returned)).toEqual({
      liveEdits: edits({ score: "typed" }),
      persistedBaseline: edits({ score: "saved" }),
      saveNotice: null,
      saveStatus: "ready",
    });
  });

  it("rejects stale selection writes and discards after an A-B-A switch", () => {
    const { session, scope } = openCourse();
    session.activate("account", "lifetime", "B");
    const returned = session.activate("account", "lifetime", "A")!;
    session.recordEdit(returned, edits({ score: "current" }));

    expect(session.recordEdit(scope, edits({ score: "stale" }))).toBe(false);
    expect(session.beginSave(scope)).toBeUndefined();
    session.acknowledgeDiscard(scope, true);

    expect(session.read(scope)).toBeUndefined();
    expect(session.read(returned)).toEqual({
      liveEdits: edits({ score: "current" }),
      persistedBaseline: edits({ score: "saved" }),
      saveNotice: null,
      saveStatus: "ready",
    });
  });

  it("explicitly refuses edits until the course readback initializes the cache", () => {
    const session = createRepoGradesDraftSession();
    const scope = session.activate("account", "lifetime", "A")!;
    const typed = edits({ score: "typed" });
    expect(session.read(scope)).toBeUndefined();
    expect(session.recordEdit(scope, typed)).toBe(false);
    session.initialize(scope, edits({ score: "saved" }));
    expect(session.recordEdit(scope, typed)).toBe(true);
    session.initialize(scope, edits({ score: "late hydration" }));
    expect(session.read(scope)?.liveEdits).toEqual(typed);
  });

  it("drops all courses on account or lifetime change and explicit account clear", () => {
    const { session, scope } = openCourse();
    const pending = session.beginSave(scope)!;
    const other = session.activate("account", "lifetime", "B")!;
    session.initialize(other, edits({ comment: "other private draft" }));
    const newAccount = session.activate("different", "lifetime", "A")!;
    expect(session.read(newAccount)).toBeUndefined();
    session.initialize(newAccount, edits({ score: "new account" }));
    pending.acknowledge(true);
    expect(session.read(newAccount)?.persistedBaseline).toEqual(edits({ score: "new account" }));

    const priorAccount = session.activate("account", "lifetime", "B")!;
    expect(session.read(priorAccount)).toBeUndefined();
    session.initialize(priorAccount, edits({ score: "another login" }));
    const nextLifetime = session.activate("account", "new lifetime", "B")!;
    expect(session.read(nextLifetime)).toBeUndefined();
    session.initialize(nextLifetime, edits({ score: "next lifetime" }));

    session.clearAccount();
    expect(session.read(nextLifetime)).toBeUndefined();
    session.initialize(nextLifetime, edits({ score: "stale hydration" }));
    const reopened = session.activate("account", "new lifetime", "B")!;
    expect(session.read(reopened)).toBeUndefined();
  });

  it("isolates nested edits from input, read snapshots, and save attempts", () => {
    const { session, scope } = openCourse();
    const file = { name: "main.py", extension: ".py", previewContent: "code", previewTruncated: false };
    const files = ["main.py"];
    const rubricAreas = [{ area: "Style", score: "1/2", comment: "review" }];
    const draft = { score: "1", comment: "", strengths: "", improvements: "", resubmitNotice: "" };
    const input = edits({
      submittedFiles: [file],
      codeExecution: { language: "python", files, ran: true, exitCode: 0, stdout: "", stderr: "" },
      retainedResults: [{
        id: "local:1",
        draft,
        source: {
          ...draft,
          generatedScore: "1",
          generatedComment: null,
          rubricAreas,
          submissionTruncated: false,
          mergeStatus: null,
          mergeFoundOnBranch: null,
        },
      }],
    });
    session.recordEdit(scope, input);
    file.previewContent = "changed";
    rubricAreas[0].comment = "changed";
    files.push("other.py");
    draft.score = "changed";

    const read = session.read(scope)!.liveEdits.repo.folder;
    const save = session.beginSave(scope)!;
    expect(read.submittedFiles[0].previewContent).toBe("code");
    expect(read.codeExecution?.files).toEqual(["main.py"]);
    expect(read.retainedResults?.[0].source.rubricAreas[0].comment).toBe("review");
    expect(read.retainedResults?.[0].draft?.score).toBe("1");
    read.submittedFiles[0].previewContent = "edited read";
    save.edits.repo.folder.codeExecution!.files.push("edited save");
    save.expected.repo.folder.score = "edited expectation";
    expect(session.read(scope)?.liveEdits.repo.folder.submittedFiles[0].previewContent).toBe("code");
    expect(session.read(scope)?.liveEdits.repo.folder.codeExecution?.files).toEqual(["main.py"]);
    expect(session.read(scope)?.persistedBaseline.repo.folder.score).toBe("saved");
  });

  it("advances to the exact normalized store readback without replacing newer live edits", () => {
    const { session, scope } = openCourse();
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => { raw = value; },
      removeItem: () => { raw = null; },
    };
    persistRepoGradeCellsTo(storage, "key", "A", edits({ score: "saved" }), "initial");
    const attempted = edits({ score: "write", grading: true, gradeError: "transient", postStatus: "posting" });
    session.recordEdit(scope, {
      repo: { ...attempted.repo, transientOnly: { ...defaultRepoGradeCellEdit(), grading: true } },
    });
    const save = session.beginSave(scope)!;

    expect(persistRepoGradeCellsTo(storage, "key", "A", save.edits, "next", undefined, save.expected)).toBeNull();
    const other = session.activate("account", "lifetime", "B")!;
    session.initialize(other, edits({ score: "other" }));
    save.acknowledge(true);
    expect(session.read(other)?.persistedBaseline).toEqual(edits({ score: "other" }));
    const returned = session.activate("account", "lifetime", "A")!;
    session.initialize(returned, loadRepoGradeCellsFrom(storage, "key", "A"));
    session.recordEdit(returned, edits({ score: "newer" }));
    save.acknowledge(false);

    const result = session.read(returned)!;
    expect(result.liveEdits).toEqual(edits({ score: "newer" }));
    expect(result.persistedBaseline).toEqual(loadRepoGradeCellsFrom(storage, "key", "A"));
    expect(Object.keys(result.persistedBaseline.repo)).toEqual(["folder"]);
    expect(result.persistedBaseline.repo.folder).toMatchObject({ grading: false, gradeError: null, postStatus: "error" });
    expect(result.saveNotice).toBeNull();
    const next = session.beginSave(returned)!;
    expect(persistRepoGradeCellsTo(storage, "key", "A", next.edits, "again", undefined, next.expected)).toBeNull();
  });

  it("serializes saves across A-B-A and keeps newer live edits during delayed acknowledgement", () => {
    const { session, scope } = openCourse();
    session.recordEdit(scope, edits({ score: "first" }));
    const first = session.beginSave(scope)!;
    session.activate("account", "lifetime", "B");
    const returned = session.activate("account", "lifetime", "A")!;
    session.recordEdit(returned, edits({ score: "second" }));
    expect(session.read(returned)?.saveStatus).toBe("pending");
    expect(session.beginSave(returned)).toBeUndefined();
    first.acknowledge(true);
    const second = session.beginSave(returned)!;
    expect(second.expected).toEqual(edits({ score: "first" }));
    expect(second.edits).toEqual(edits({ score: "second" }));
    second.acknowledge(false);
    first.acknowledge(true);
    expect(session.read(returned)?.saveNotice).toBe(REPO_GRADE_SESSION_SAVE_FAILURE);
    expect(session.read(returned)?.persistedBaseline).toEqual(edits({ score: "first" }));
  });

  it("preserves the last known baseline and blocks a retry when a write is uncertain", () => {
    const { session, scope } = openCourse();
    session.recordEdit(scope, edits({ score: "maybe saved" }));
    session.beginSave(scope)!.acknowledge("uncertain");
    session.activate("account", "lifetime", "B");
    const returned = session.activate("account", "lifetime", "A")!;
    expect(session.read(returned)).toEqual({
      liveEdits: edits({ score: "maybe saved" }),
      persistedBaseline: edits({ score: "saved" }),
      saveNotice: REPO_GRADE_SESSION_SAVE_FAILURE,
      saveStatus: "uncertain",
    });
    expect(session.beginSave(returned)).toBeUndefined();
  });

  it("retains a fixed save failure across switches and preserves state on failed discard", () => {
    const { session, scope } = openCourse();
    session.recordEdit(scope, edits({ score: "unsaved" }));
    session.beginSave(scope)!.acknowledge(false);
    const failure = {
      liveEdits: edits({ score: "unsaved" }),
      persistedBaseline: edits({ score: "saved" }),
      saveNotice: REPO_GRADE_SESSION_SAVE_FAILURE,
      saveStatus: "ready",
    };
    expect(session.read(scope)).toEqual(failure);
    session.activate("account", "lifetime", null);
    const returned = session.activate("account", "lifetime", "A")!;
    session.acknowledgeDiscard(returned, false);
    expect(session.read(returned)).toEqual(failure);
    session.beginSave(returned)!.acknowledge(true);
    expect(session.read(returned)?.saveNotice).toBeNull();
  });

  it("clears only the successfully discarded course and revokes its pending callbacks", () => {
    const { session } = openCourse();
    const other = session.activate("account", "lifetime", "B")!;
    session.initialize(other, edits({ score: "keep" }));
    const scope = session.activate("account", "lifetime", "A")!;
    const pending = session.beginSave(scope)!;
    session.acknowledgeDiscard(scope, true);
    const reopened = session.activate("account", "lifetime", "A")!;
    expect(session.read(reopened)).toBeUndefined();
    session.initialize(reopened, {});
    pending.acknowledge(true);
    expect(session.read(reopened)?.persistedBaseline).toEqual({});
    const returned = session.activate("account", "lifetime", "B")!;
    expect(session.read(returned)?.liveEdits).toEqual(edits({ score: "keep" }));
  });
});
