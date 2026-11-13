import { useId, useRef, useState, type FormEvent } from "react";
import { Box, Typography, Autocomplete, Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import {
  loadRepoGradeProfile, profileDraft, saveRepoGradeProfile,
  type ProfileDraft, type ProfileReadResult, type SavedProfile,
} from "./repoGradesProfileClient";
import type { RepoGradeColumn } from "./repoGradesRows";
import RepoGradePreparationPolicySettings from "./RepoGradePreparationPolicySettings";
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

export default function RepoGradeProfileSettings({ courseId, organization, columns }: {
  courseId: string;
  organization: string;
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
    <Box component="section" className={styles.profileSettings}>
      <Typography variant="subtitle2">Automatic grading profiles</Typography>
      <p>Save settings for one folder in this course. Automatic checks use the matching folder profile when a run starts.</p>
      <form className={styles.dashboard} onSubmit={(event) => {
        event.preventDefault();
        void openFolder(path);
      }}>
        <Autocomplete freeSolo options={columns.map(({ folder }) => folder)} inputValue={path}
          onInputChange={(_, value) => setPath(value)}
          renderInput={(params) => <TextField {...params} id={`${id}-folder`} label="Repository folder path" required size="small"
            helperText="Choose a discovered folder or enter its exact path. Loading a profile replaces unsaved edits." />} />
        <div><Button type="submit" variant="outlined">Load folder profile</Button></div>
      </form>
      {load && !result && <p role="status">Loading profile for {load.folder}.</p>}
      {result && !profileReady && <p role="alert">{PROFILE_ERROR[result.status]}</p>}
      {load && profileReady && <div key={load.request}>
        <ProfileForm courseId={courseId} organization={organization} folder={load.folder}
          initialProfile={result.status === "loaded" ? result.profile : null}
          reload={() => void openFolder(load.folder)} />
        <RepoGradePreparationPolicySettings courseId={courseId} folder={load.folder} />
      </div>}
      </Box>
  );
}

type SaveStatus = Awaited<ReturnType<typeof saveRepoGradeProfile>>["status"] | "saving" | null;

export function ProfileForm({ courseId, organization, folder, initialProfile, reload }: {
  courseId: string;
  organization: string;
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
  const targetedExecution = organization.trim().toLowerCase() === "intro-to-computer-science-fall-2026" && folder === "assignments/module_12";
  const invalidExecutionProvider = targetedExecution && draft.runCode && draft.provider !== "gemini";

  function updateDraft(changes: Partial<ProfileDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    if (status !== "conflict") setStatus(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || status === "conflict" || invalidExecutionProvider) return;
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
        <TextField select id={`${id}-provider`} label="Grading provider" size="small" value={draft.provider} disabled={savingProfile} onChange={(event) => {
            const provider = event.target.value === "embedded" ? "embedded" : "gemini";
            if (provider === "embedded" && !existingEmbeddedGenerator) setGenerateRubric(false);
            updateDraft({ provider });
          }}>
            <MenuItem value="gemini">Gemini</MenuItem>
            <MenuItem value="embedded">Embedded grader</MenuItem>
        </TextField>
        <TextField id={`${id}-branch`} label="Source branch" size="small" value={draft.sourceRef}
          helperText="Leave blank to use each repository's default branch."
          onChange={(event) => updateDraft({ sourceRef: event.currentTarget.value })} />
        <TextField id={`${id}-instructions`} label="Saved assignment instructions" multiline minRows={3}
          value={draft.instructions} required={!draft.useReadmeInstructions}
          onChange={(event) => updateDraft({ instructions: event.currentTarget.value })} />
        {(draft.provider === "gemini" || existingEmbeddedGenerator) && <FormControlLabel
          control={<Checkbox checked={generateRubric} disabled={savingProfile} onChange={(event) => {
            setGenerateRubric(event.currentTarget.checked);
            setRubricError(false);
            if (status !== "conflict") setStatus(null);
          }} />} label="Generate the rubric from the assignment instructions" />}
        {!generateRubric && <TextField id={`${id}-rubric`} label="Saved grading rubric" multiline minRows={3}
          value={draft.rubric} required error={rubricError} helperText={rubricError ? "Enter a grading rubric for this folder." : undefined}
            onChange={(event) => {
              setRubricError(false);
              updateDraft({ rubric: event.currentTarget.value });
            }} />}
        <FormControlLabel control={<Checkbox checked={draft.applyNamingDeduction} disabled={savingProfile}
          onChange={(event) => updateDraft({ applyNamingDeduction: event.currentTarget.checked })} />} label="Apply naming deductions" />
        <Typography component="p" variant="body2">Automatic code execution is unavailable. {targetedExecution && "For this assignment, targeted regrades can run source tests in an isolated sandbox and save an unscored review draft. This requires Gemini. With this option on, automatic checks for this folder do not run."}</Typography>
        {targetedExecution ? <FormControlLabel control={<Checkbox checked={draft.runCode} disabled={savingProfile || (draft.provider !== "gemini" && !draft.runCode)}
          onChange={(event) => updateDraft({ runCode: event.currentTarget.checked })} />}
          label="Run source tests for targeted regrades (review only)" /> : baseline?.runCode && (
          <FormControlLabel control={<Checkbox checked={draft.runCode} disabled={savingProfile}
            onChange={(event) => updateDraft({ runCode: event.currentTarget.checked })} />}
            label="Keep saved code execution opt-in. Clear it to use automatic grading." />
        )}
        {baseline?.targetBranch && (
          <FormControlLabel control={<Checkbox checked={draft.targetBranch !== null} disabled={savingProfile}
            onChange={(event) => updateDraft({ targetBranch: event.currentTarget.checked ? baseline.targetBranch : null })} />}
            label={<>Keep saved merge target <code>{baseline.targetBranch}</code>. Clear it to use automatic grading.</>} />
        )}
        {baseline?.useReadmeInstructions && (
          <FormControlLabel control={<Checkbox checked={draft.useReadmeInstructions} disabled={savingProfile}
            onChange={(event) => updateDraft({ useReadmeInstructions: event.currentTarget.checked })} />}
            label="Keep saved README instruction mode. Clear it and enter assignment instructions to use automatic grading." />
        )}
      </fieldset>
      {saveError && <p role="alert">{saveError}</p>}
      {invalidExecutionProvider && <Typography role="alert" color="error" variant="body2">Choose Gemini or clear source test execution before saving.</Typography>}
      <div>
        <Button type="submit" variant="contained" disabled={savingProfile || status === "conflict" || invalidExecutionProvider}>Save folder profile</Button>
        {status === "conflict" && <Button type="button" onClick={reload}>Reload saved profile and discard edits</Button>}
      </div>
    </form>
  );
}
