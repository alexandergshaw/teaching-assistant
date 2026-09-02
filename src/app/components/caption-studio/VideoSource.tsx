"use client";

import React from "react";
import { Button, TextField } from "@mui/material";
import type { DirHandle, BackupVideo } from "@/lib/backup-dir";
import type { RecordingFile } from "@/lib/recording-files";
import type { Take } from "../RecordingTab";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { fmtTime } from "./utils/formatting";

interface VideoSourceProps {
  fileName: string;
  setFileName: (name: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importError: string | null;
  takes: Take[];
  backupDir: DirHandle | null;
  onImportTake: (take: Take) => Promise<void>;
  folderVideos: BackupVideo[] | null;
  folderBusy: boolean;
  onBrowseFolder: () => Promise<void>;
  onImportFolderVideo: (name: string) => Promise<void>;
  libraryBusy: boolean;
  libraryVideos: RecordingFile[] | null;
  onLoadLibrary: () => Promise<void>;
  onImportLibraryVideo: (file: RecordingFile) => Promise<void>;
  importingKey: string | null;
  /** docs/recording-controls-ux-acceptance-criteria.md CC6 gap: SpeedPanel's
   *  "Choose video" gates on its own render busy state (speed.busy) so a new
   *  source cannot be picked out from under an in-flight job; this sibling
   *  picker had no equivalent gate at all. The caller passes whatever it
   *  considers "busy" for the surface this picker feeds (here: caption
   *  generation or a burn-in export in progress). Reported, not fixed:
   *  SpeedPanel.tsx:73-199 duplicating this component's three lists is a
   *  documented follow-up (section 7), not this group's job to unify. */
  busy?: boolean;
}

export function VideoSource({
  fileName,
  setFileName,
  fileInputRef,
  onFileChange,
  importError,
  takes,
  backupDir,
  onImportTake,
  folderVideos,
  folderBusy,
  onBrowseFolder,
  onImportFolderVideo,
  libraryBusy,
  libraryVideos,
  onLoadLibrary,
  onImportLibraryVideo,
  importingKey,
  busy = false,
}: VideoSourceProps) {
  return (
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Video</legend>
      <div className={styles.adaptRow}>
        <Button
          variant="outlined"
          size="small"
          className={controls.fieldRowButton}
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          Choose video
        </Button>
        <input ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={onFileChange} />
        {fileName && (
          <TextField
            size="small"
            label="Video name"
            className={controls.fieldLg}
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
          />
        )}
      </div>

      {importError && (
        <p role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
          {importError}
        </p>
      )}

      {(takes.length > 0 || backupDir || libraryVideos !== undefined) && (
        <div className={controls.stack}>
          <p className={styles.fieldHint}>
            Or import a saved video
          </p>

          {libraryVideos !== undefined && (
            <div className={controls.stack}>
              <p className={controls.subLabel}>
                From the Files tab
              </p>
              {libraryBusy && !libraryVideos && (
                <p role="status" aria-live="polite" className={controls.loadingLine}>
                  <span className={styles.spinner} aria-hidden="true" /> Loading your library…
                </p>
              )}
              {libraryVideos && libraryVideos.length === 0 && (
                <p className={styles.fieldHint}>
                  No saved videos yet - record one on the Recording tab or upload on the Files tab.
                </p>
              )}
              <Button
                variant="text"
                size="small"
                loading={libraryBusy}
                loadingPosition="start"
                onClick={() => void onLoadLibrary()}
              >
                {libraryBusy ? "Loading…" : "Refresh"}
              </Button>
              {libraryVideos && libraryVideos.map((v) => (
                <div key={v.id} className={controls.listRow}>
                  <span className={`${styles.ghMeta} ${controls.growMeta}`}>
                    {v.name} - {v.kind === "recording" ? "Recording" : v.kind === "narrated" ? "Narrated" : "Captioned"}
                    {v.durationSec && ` - ${fmtTime(v.durationSec)}`}
                    {" "}
                    - {(v.sizeBytes / 1048576).toFixed(1)} MB
                  </span>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={importingKey !== null}
                    loading={importingKey === "lib:" + v.id}
                    loadingPosition="start"
                    onClick={() => void onImportLibraryVideo(v)}
                  >
                    {importingKey === "lib:" + v.id ? "Importing…" : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {takes.length > 0 && (
            <div className={controls.stack}>
              <p className={controls.subLabel}>
                From current session
              </p>
              {takes.map((take) => (
                <div key={take.id} className={controls.listRow}>
                  <span className={`${styles.ghMeta} ${controls.growMeta}`}>
                    {take.name} - {fmtTime(take.durationSec)} - {(take.sizeBytes / 1048576).toFixed(1)} MB
                  </span>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={importingKey !== null}
                    loading={importingKey === "take:" + take.id}
                    loadingPosition="start"
                    onClick={() => void onImportTake(take)}
                  >
                    {importingKey === "take:" + take.id ? "Importing…" : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {backupDir && (
            <div className={controls.stack}>
              <p className={controls.subLabel}>
                From backup folder ({backupDir.name})
              </p>
              <Button
                variant="text"
                size="small"
                loading={folderBusy}
                loadingPosition="start"
                onClick={() => void onBrowseFolder()}
              >
                {folderBusy ? "Reading folder…" : folderVideos ? "Refresh" : "Browse"}
              </Button>
              {folderVideos && folderVideos.length === 0 && <p className={styles.fieldHint}>No videos found.</p>}
              {folderVideos && folderVideos.map((v) => (
                <div key={v.name} className={controls.listRow}>
                  <span className={`${styles.ghMeta} ${controls.growMeta}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.name} - {(v.sizeBytes / 1048576).toFixed(1)} MB - {new Date(v.lastModified).toLocaleString()}
                  </span>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={importingKey !== null}
                    loading={importingKey === "file:" + v.name}
                    loadingPosition="start"
                    onClick={() => void onImportFolderVideo(v.name)}
                  >
                    {importingKey === "file:" + v.name ? "Importing…" : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
