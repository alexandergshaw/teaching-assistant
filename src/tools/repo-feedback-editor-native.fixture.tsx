import { useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { RepoDashboardFeedback } from "../app/components/repo-grades/RepoDashboardFeedback";
import {
  applyRepoGradeCompletion,
  applyRepoGradeFeedbackFieldEdit,
  applyRetainedRepoGradeDraftEdit,
  getRepoGradeCellEdit,
  setRepoGradeCellEdit,
} from "../app/components/repo-grades/repoGradesCellEdits";
import { createRepoGradesDraftController } from "../app/components/repo-grades/repoGradesDraftController";

const accountId = "synthetic-account";
const repo = "synthetic/repository";
const folder = "exercise";

function seed(courseId: string) {
  const edits = setRepoGradeCellEdit({}, repo, folder, {
    draftRevision: 1,
    score: courseId === "A" ? "3" : "4",
    comment: `Current ${courseId}`,
    strengths: `Current strengths ${courseId}`,
  });
  return applyRepoGradeCompletion(edits, repo, folder, 0, {
    score: "8",
    generatedScore: "8",
    comment: `Original ${courseId} overall`,
    strengths: `  ${courseId} strength \u2014 evidence  `,
    improvements: "  Improve \u2013 detail  ",
    resubmitNotice: "",
    rubricAreas: [{ area: "Synthetic rubric", score: "8", comment: "Original rubric evidence" }],
  });
}

const controller = createRepoGradesDraftController(accountId, {
  restore: (courseId) => ({ edits: seed(courseId), notice: null }),
  save: () => "Fixture storage refusal",
  discard: () => ({ notice: null }),
});
controller.select("A");

const writes: string[] = [];
let pending: { resolve: () => void; reject: (error: Error) => void } | null = null;
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText(value: string) {
      if (pending) throw new Error("A clipboard write is already pending");
      writes.push(value);
      return new Promise<void>((resolve, reject) => { pending = { resolve, reject }; });
    },
  },
});
Object.assign(window, {
  fixtureClipboard: {
    writes,
    async settle(success: boolean) {
      const write = pending;
      if (!write) throw new Error("There is no pending clipboard write");
      pending = null;
      if (success) write.resolve();
      else write.reject(new DOMException("Fixture denial", "NotAllowedError"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  },
});

function Fixture() {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    if (snapshot?.saveDue) void controller.save(snapshot.scope);
  }, [snapshot]);
  if (!snapshot) return null;
  const { courseId, edits, scope, saveNotice } = snapshot;
  return (
    <main>
      <h1>Synthetic course {courseId}</h1>
      <button type="button" onClick={() => controller.select("A")}>Select course A</button>
      <button type="button" onClick={() => controller.select("B")}>Select course B</button>
      {saveNotice && <p role="status">{saveNotice}</p>}
      <RepoDashboardFeedback key={courseId} accountId={accountId} courseId={courseId} repo={repo} folder={folder}
        edit={getRepoGradeCellEdit(edits, repo, folder)} isCurrentCellScope={() => controller.isCurrent(scope)}
        onScoreChange={(score) => controller.edit(scope, (current) => setRepoGradeCellEdit(current, repo, folder, { score }))}
        onFeedbackChange={(field, value) => controller.edit(scope, (current) =>
          setRepoGradeCellEdit(current, repo, folder, applyRepoGradeFeedbackFieldEdit(getRepoGradeCellEdit(current, repo, folder), field, value)))}
        onRetainedDraftChange={(targetRepo, targetFolder, expected, field, value) => controller.edit(scope, (current) =>
          applyRetainedRepoGradeDraftEdit(current, targetRepo, targetFolder, expected, field, value))} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
