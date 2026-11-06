import { useId, useRef, useState, type FormEvent } from "react";
import {
  loadRepoGradeProfile, profileDraft, saveRepoGradeProfile,
  type ProfileDraft, type ProfileReadResult, type SavedProfile,
} from "./repoGradesProfileClient";
import type { RepoGradeColumn } from "./repoGradesRows";
import RepoGradePreparationPolicySettings from "./RepoGradePreparationPolicySettings";
import pageStyles from "../../page.module.css";
import styles from "./repo-grades-dashboard.module.css";

const PROFILE_ERROR = {
  "course-unavailable": "This course is unavailable.",
  "organization-unavailable": "Set a valid GitHub organization for this course before saving profiles.",
  "storage-unavailable": "Profile storage is unavailable. Try again later.",
  "invalid-scope": "Enter the exact folder path relative to the repository root.",
  "invalid-settings": "Check your settings. Enter a branch name in Source branch, or leave it blank.",
  "invalid-grader": "The selected grader is unavailable.",
  "missing-instructions": "Enter saved grading instructions for this folder.",
  "invalid-fingerprint": "Reload the saved profile before saving changes.",
  "invalid-provider": "Choose an available grading provider.",
  conflict: "Someone changed this profile since you opened it. Reload the saved profile before saving again.",
  "request-failed": "The request could not be completed. Check your connection and try again.",
};

export default function RepoGradeProfileSettings({ courseId, columns }: {
  courseId: string;
  columns: readonly RepoGradeColumn[];
}) {
  const id = useId();
  const [path, setPath] = useState("");
  const [load, setLoad] = useState<{ request: number; folder: string; result: ProfileReadResult | null } | null>(null);
  const latestLoad = useRef(0);

  async function openFolder(folder: string) {
    const request = ++latestLoad.current;
    setLoad({ request, folder, result: null });
    const result = await loadRepoGradeProfile(courseId, folder);
    if (request === latestLoad.current) setLoad({ request, folder, result });
  }

  const result = load?.result;
  const profileReady = result?.status === "loaded" || result?.status === "not-configured";

  return (
    <details className={styles.profileSettings}>
      <summary>Automatic grading profiles</summary>
      <p>Save settings for one folder in this course. Automatic checks use the matching folder profile when a run starts.</p>
      <form className={styles.dashboard} onSubmit={(event) => {
        event.preventDefault();
        void openFolder(path);
      }}>
        <div className={pageStyles.field}>
          <label htmlFor={`${id}-folder`}>Repository folder path</label>
          <input id={`${id}-folder`} type="text" list={`${id}-folders`} value={path}
            onChange={(event) => setPath(event.currentTarget.value)} required autoComplete="off"
            aria-describedby={`${id}-folder-hint`} />
          <datalist id={`${id}-folders`}>
            {columns.map(({ folder }) => <option key={folder} value={folder} />)}
          </datalist>
          <p id={`${id}-folder-hint`}>Choose a discovered folder or enter its exact path. Loading a profile replaces unsaved edits.</p>
        </div>
        <div><button type="submit">Load folder profile</button></div>
      </form>
      {load && !result && <p role="status">Loading profile for {load.folder}.</p>}
      {result && !profileReady && <p role="alert">{PROFILE_ERROR[result.status]}</p>}
      {load && profileReady && <div key={load.request}>
        <ProfileForm courseId={courseId} folder={load.folder}
          initialProfile={result.status === "loaded" ? result.profile : null}
          reload={() => void openFolder(load.folder)} />
        <RepoGradePreparationPolicySettings courseId={courseId} folder={load.folder} />
      </div>}
    </details>
  );
}

type SaveStatus = Awaited<ReturnType<typeof saveRepoGradeProfile>>["status"] | "saving" | null;

function ProfileForm({ courseId, folder, initialProfile, reload }: {
  courseId: string;
  folder: string;
  initialProfile: SavedProfile | null;
  reload: () => void;
}) {
  const id = useId();
  const [baseline, setBaseline] = useState(initialProfile);
  const [draft, setDraft] = useState(() => profileDraft(initialProfile));
  const [status, setStatus] = useState<SaveStatus>(null);
  const saving = useRef(false);
  const [rubricError, setRubricError] = useState(false);
  const [generateRubric, setGenerateRubric] = useState(initialProfile?.rubricPolicy === "generate");
  const savingProfile = status === "saving";
  const existingEmbeddedGenerator = baseline?.provider === "embedded" && baseline.rubricPolicy === "generate";

  function updateDraft(changes: Partial<ProfileDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    if (status !== "conflict") setStatus(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || status === "conflict") return;
    if (!generateRubric && !draft.rubric.trim()) {
      setRubricError(true);
      return;
    }

    saving.current = true;
    setStatus("saving");
    const result = await saveRepoGradeProfile(courseId, folder, generateRubric ? { ...draft, rubric: "" } : draft, baseline);
    saving.current = false;
    if (result.status === "saved") {
      setBaseline(result.profile);
      setDraft(profileDraft(result.profile));
    }
    setStatus(result.status);
  }

  const saveError = status && status !== "saving" && status !== "saved" ? PROFILE_ERROR[status] : null;
  return (
    <form className={styles.dashboard} onSubmit={handleSave} aria-labelledby={`${id}-heading`}>
      <h4 id={`${id}-heading`}>Profile for <code>{folder}</code></h4>
      <p role="status">{savingProfile ? "Saving profile." : status === "saved" ? "Profile saved."
        : baseline ? "Saved profile loaded." : "No saved profile for this folder."}</p>
      <fieldset className={styles.profileFields} disabled={savingProfile}>
        <div className={pageStyles.field}>
          <label htmlFor={`${id}-provider`}>Grading provider</label>
          <select id={`${id}-provider`} value={draft.provider} onChange={(event) => {
            const provider = event.currentTarget.value === "embedded" ? "embedded" : "gemini";
            if (provider === "embedded" && !existingEmbeddedGenerator) setGenerateRubric(false);
            updateDraft({ provider });
          }}>
            <option value="gemini">Gemini</option>
            <option value="embedded">Embedded grader</option>
          </select>
        </div>
        <div className={pageStyles.field}>
          <label htmlFor={`${id}-branch`}>Source branch</label>
          <input id={`${id}-branch`} type="text" value={draft.sourceRef} aria-describedby={`${id}-branch-hint`}
            onChange={(event) => updateDraft({ sourceRef: event.currentTarget.value })} />
          <p id={`${id}-branch-hint`}>Leave blank to use each repository&apos;s default branch.</p>
        </div>
        <div className={pageStyles.field}>
          <label htmlFor={`${id}-instructions`}>Saved assignment instructions</label>
          <textarea id={`${id}-instructions`} value={draft.instructions} required={!draft.useReadmeInstructions}
            onChange={(event) => updateDraft({ instructions: event.currentTarget.value })} />
        </div>
        {(draft.provider === "gemini" || existingEmbeddedGenerator) && <label>
          <input type="checkbox" checked={generateRubric} onChange={(event) => {
            setGenerateRubric(event.currentTarget.checked);
            setRubricError(false);
            if (status !== "conflict") setStatus(null);
          }} />
          {" "}Generate the rubric from the assignment instructions
        </label>}
        {!generateRubric && <div className={pageStyles.field}>
          <label htmlFor={`${id}-rubric`}>Saved grading rubric</label>
          <textarea id={`${id}-rubric`} value={draft.rubric} required aria-invalid={rubricError || undefined}
            onChange={(event) => {
              setRubricError(false);
              updateDraft({ rubric: event.currentTarget.value });
            }} />
          {rubricError && <p role="alert">Enter a grading rubric for this folder.</p>}
        </div>}
        <label>
          <input type="checkbox" checked={draft.applyNamingDeduction}
            onChange={(event) => updateDraft({ applyNamingDeduction: event.currentTarget.checked })} />
          {" "}Apply naming deductions
        </label>
        <p>Automatic code execution is unavailable.</p>
        {baseline?.runCode && (
          <label>
            <input type="checkbox" checked={draft.runCode}
              onChange={(event) => updateDraft({ runCode: event.currentTarget.checked })} />
            {" "}Keep saved code execution opt-in. Clear it to use automatic grading.
          </label>
        )}
        {baseline?.targetBranch && (
          <label>
            <input type="checkbox" checked={draft.targetBranch !== null}
              onChange={(event) => updateDraft({ targetBranch: event.currentTarget.checked ? baseline.targetBranch : null })} />
            {" "}Keep saved merge target <code>{baseline.targetBranch}</code>. Clear it to use automatic grading.
          </label>
        )}
        {baseline?.useReadmeInstructions && (
          <label>
            <input type="checkbox" checked={draft.useReadmeInstructions}
              onChange={(event) => updateDraft({ useReadmeInstructions: event.currentTarget.checked })} />
            {" "}Keep saved README instruction mode. Clear it and enter assignment instructions to use automatic grading.
          </label>
        )}
      </fieldset>
      {saveError && <p role="alert">{saveError}</p>}
      <div>
        <button type="submit" disabled={savingProfile || status === "conflict"}>Save folder profile</button>
        {status === "conflict" && <button type="button" onClick={reload}>Reload saved profile and discard edits</button>}
      </div>
    </form>
  );
}
