"use client";

import React from "react";
import { Button, TextField } from "@mui/material";
import type { DirHandle, BackupVideo } from "@/lib/backup-dir";
import type { RecordingFile } from "@/lib/recording-files";
import type { Take } from "../RecordingTab";
import styles from "../../page.module.css";
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
}: VideoSourceProps) {
  return (
    <div className={styles.field}>
      <p className={styles.adaptPanelSubtitle} style={{ marginBottom: 8 }}>
        1. Video source
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="outlined" size="small" onClick={() => fileInputRef.current?.click()}>
          Choose video
        </Button>
        <input ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={onFileChange} />
        {fileName && (
          <TextField
            size="small"
            label="Video name"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            sx={{ width: 200 }}
          />
        )}
      </div>

      {importError && <p className={styles.error}>{importError}</p>}

      {(takes.length > 0 || backupDir || libraryVideos !== undefined) && (
        <div style={{ marginTop: 16 }}>
          <p className={styles.fieldHint} style={{ margin: "0 0 8px 0" }}>
            Or import a saved video:
          </p>

          {libraryVideos !== undefined && (
            <div style={{ marginTop: 8 }}>
              <p className={styles.fieldHint} style={{ margin: "0 0 8px 0", fontWeight: 600 }}>
                From the Files tab
              </p>
              {libraryBusy && !libraryVideos && <p className={styles.fieldHint} style={{ margin: 0 }}>Loading your library...</p>}
              {libraryVideos && libraryVideos.length === 0 && (
                <p className={styles.fieldHint} style={{ margin: 0 }}>
                  No saved videos yet - record one on the Recording tab or upload on the Files tab.
                </p>
              )}
              <Button variant="text" size="small" disabled={libraryBusy} onClick={() => void onLoadLibrary()}>
                {libraryBusy ? "Loading..." : "Refresh"}
              </Button>
              {libraryVideos && libraryVideos.map((v) => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
                  <span className={styles.ghMeta} style={{ flex: 1, minWidth: 0 }}>
                    {v.name} - {v.kind === "recording" ? "Recording" : v.kind === "narrated" ? "Narrated" : "Captioned"}
                    {v.durationSec && ` - ${fmtTime(v.durationSec)}`}
                    {" "}
                    - {(v.sizeBytes / 1048576).toFixed(1)} MB
                  </span>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={importingKey !== null}
                    onClick={() => void onImportLibraryVideo(v)}
                  >
                    {importingKey === "lib:" + v.id ? "Importing..." : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {takes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p className={styles.fieldHint} style={{ margin: "0 0 8px 0", fontWeight: 600 }}>
                From current session
              </p>
              {takes.map((take) => (
                <div key={take.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
                  <span className={styles.ghMeta} style={{ flex: 1, minWidth: 0 }}>
                    {take.name} - {fmtTime(take.durationSec)} - {(take.sizeBytes / 1048576).toFixed(1)} MB
                  </span>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={importingKey !== null}
                    onClick={() => void onImportTake(take)}
                  >
                    {importingKey === "take:" + take.id ? "Importing..." : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {backupDir && (
            <div style={{ marginTop: 8 }}>
              <p className={styles.fieldHint} style={{ margin: "0 0 8px 0", fontWeight: 600 }}>
                From backup folder ({backupDir.name})
              </p>
              <Button variant="text" size="small" disabled={folderBusy} onClick={() => void onBrowseFolder()}>
                {folderBusy ? "Reading folder..." : folderVideos ? "Refresh" : "Browse"}
              </Button>
              {folderVideos && folderVideos.length === 0 && <p className={styles.fieldHint} style={{ margin: 0 }}>No videos found.</p>}
              {folderVideos && folderVideos.map((v) => (
                <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
                  <span className={styles.ghMeta} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.name} - {(v.sizeBytes / 1048576).toFixed(1)} MB - {new Date(v.lastModified).toLocaleString()}
                  </span>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={importingKey !== null}
                    onClick={() => void onImportFolderVideo(v.name)}
                  >
                    {importingKey === "file:" + v.name ? "Importing..." : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
