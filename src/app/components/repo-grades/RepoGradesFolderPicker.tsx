"use client";

// The "Assignment folder to grade" picker, relocated from the stacked controls
// panel into the sticky working header (docs/repo-grades-module-picker-header-
// scope.md). It is a browser-safe leaf: it owns no state - every value and the
// change handler come in as props from index.tsx, bound to the same
// `currentSelectedFolder` / `handleFolderChange` the control always used, so
// persistence (ta-repo-grades-folder) is unchanged. The hints travel with the
// control: the branch-recorded sentence, the empty-scan hint, and the
// role="alert" drop notice that must sit next to the control that resets it.
import { ALL_FOLDERS, describeFolderOption, type FolderOption } from "./repoGradesFolderSelection";
import pageStyles from "../../page.module.css";
import styles from "./repo-grades.module.css";

export interface RepoGradesFolderPickerProps {
  folderOptions: FolderOption[];
  folderCensus: { scannedRepos: number; unknownRepos: number };
  selectedFolder: string;
  onSelectedFolderChange: (value: string) => void;
  folderDropNotice: string | null;
}

export default function RepoGradesFolderPicker({
  folderOptions,
  folderCensus,
  selectedFolder,
  onSelectedFolderChange,
  folderDropNotice,
}: RepoGradesFolderPickerProps) {
  return (
    <div className={styles.headerField}>
      <label htmlFor="repo-grades-folder" className={styles.headerInputLabel}>
        Assignment folder to grade
      </label>
      <select
        id="repo-grades-folder"
        className={styles.headerInput}
        value={selectedFolder}
        onChange={(e) => onSelectedFolderChange(e.target.value)}
      >
        <option value={ALL_FOLDERS}>All folders</option>
        {folderOptions.map((option) => (
          <option key={option.folder} value={option.folder}>
            {describeFolderOption(option, folderCensus)}
          </option>
        ))}
      </select>
      {folderOptions.length === 0 && (
        <p className={pageStyles.fieldHint}>No assignment folders were found in this course&apos;s scanned repos.</p>
      )}
      {folderDropNotice && (
        <p className={pageStyles.error} role="alert">
          {folderDropNotice}
        </p>
      )}
    </div>
  );
}
