"use client";

// The "Assignment folder to grade" picker, relocated from the stacked controls
// panel into the sticky working header (docs/repo-grades-module-picker-header-
// scope.md). It is a browser-safe leaf: it owns no state - every value and the
// change handler come in as props from index.tsx, bound to the same
// `currentSelectedFolder` / `handleFolderChange` the control always used, so
// persistence (ta-repo-grades-folder) is unchanged. The hints travel with the
// control: the empty-scan hint and the role="alert" drop notice, which now sit
// on the header's full-width trailing line (.headerFullRow) under the control
// row rather than stacked under the select, so the select stays on the band.
import { ALL_FOLDERS, describeFolderOption, type FolderOption } from "./repoGradesFolderSelection";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import NativeSelect from "@mui/material/NativeSelect";
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
    <>
      <div className={styles.headerField}>
        <FormControl fullWidth size="small" variant="standard">
        <InputLabel htmlFor="repo-grades-folder" shrink>
          Assignment folder to grade
        </InputLabel>
        <NativeSelect
          inputProps={{ id: "repo-grades-folder" }}
          value={selectedFolder}
          onChange={(e) => onSelectedFolderChange(e.target.value)}
        >
          <option value={ALL_FOLDERS}>All folders</option>
          {folderOptions.map((option) => (
            <option key={option.folder} value={option.folder}>
              {describeFolderOption(option, folderCensus)}
            </option>
          ))}
        </NativeSelect>
        </FormControl>
      </div>
      {(folderOptions.length === 0 || folderDropNotice) && (
        <div className={styles.headerFullRow}>
          {folderOptions.length === 0 && (
            <p className={pageStyles.fieldHint}>No assignment folders were found in this course&apos;s scanned repos.</p>
          )}
          {folderDropNotice && (
            <p className={pageStyles.error} role="alert">
              {folderDropNotice}
            </p>
          )}
        </div>
      )}
    </>
  );
}
