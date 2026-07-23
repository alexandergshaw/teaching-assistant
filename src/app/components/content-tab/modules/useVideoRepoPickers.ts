"use client";

import type React from "react";
import { useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { CanvasModule } from "@/lib/canvas-modules";
import { listRecordingFiles, downloadRecordingFile, extForFile, type RecordingFile } from "@/lib/recording-files";
import { createModuleItemAction, listGithubReposAction, requestFileUploadAction } from "../../../actions";

export interface UseVideoRepoPickersReturn {
  videoPickerModuleId: number | null;
  videoPickerFiles: RecordingFile[] | null;
  videoPickerLoading: boolean;
  videoPickerError: string | null;
  videoPickerBusy: boolean;
  openVideoPicker: (m: CanvasModule) => Promise<void>;
  closeVideoPicker: () => void;
  addVideoFromLibrary: (m: CanvasModule, file: RecordingFile) => Promise<void>;
  repoPickerModuleId: number | null;
  ownedRepos: string[] | null;
  repoPickerLoading: boolean;
  repoPickerError: string | null;
  repoPickerBusy: boolean;
  openRepoPicker: (m: CanvasModule) => Promise<void>;
  closeRepoPicker: () => void;
  addRepoLink: (m: CanvasModule) => Promise<void>;
  addRepoValue: Record<number, string>;
  setAddRepoValue: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  addRepoTitle: Record<number, string>;
  setAddRepoTitle: React.Dispatch<React.SetStateAction<Record<number, string>>>;
}

// Video-from-library and GitHub-repo-link pickers used by a module's "Add item" row.
export function useVideoRepoPickers(
  courseUrl: string,
  acronym: string | undefined,
  user: User | null,
  supabase: SupabaseClient<Database>,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void
): UseVideoRepoPickersReturn {
  // Video picker state: which module (if any) has the picker open, and the loaded files.
  const [videoPickerModuleId, setVideoPickerModuleId] = useState<number | null>(null);
  const [videoPickerFiles, setVideoPickerFiles] = useState<RecordingFile[] | null>(null);
  const [videoPickerLoading, setVideoPickerLoading] = useState(false);
  const [videoPickerError, setVideoPickerError] = useState<string | null>(null);
  const [videoPickerBusy, setVideoPickerBusy] = useState(false);
  // Repo link picker state: which module has the picker open, owned repos list.
  const [repoPickerModuleId, setRepoPickerModuleId] = useState<number | null>(null);
  const [ownedRepos, setOwnedRepos] = useState<string[] | null>(null);
  const [repoPickerLoading, setRepoPickerLoading] = useState(false);
  const [repoPickerError, setRepoPickerError] = useState<string | null>(null);
  const [repoPickerBusy, setRepoPickerBusy] = useState(false);
  // Per-module repo link: selected repo and title.
  const [addRepoValue, setAddRepoValue] = useState<Record<number, string>>({});
  const [addRepoTitle, setAddRepoTitle] = useState<Record<number, string>>({});

  // Open the video picker for a module, loading files from the library.
  const openVideoPicker = async (m: CanvasModule) => {
    if (!user) {
      setVideoPickerError("Sign in to use the library.");
      return;
    }
    setVideoPickerModuleId(m.id);
    setVideoPickerFiles(null);
    setVideoPickerError(null);
    setVideoPickerLoading(true);
    try {
      const files = await listRecordingFiles(supabase, user.id);
      setVideoPickerFiles(files);
      if (files.length === 0) {
        setVideoPickerError("No saved videos yet - record something on the Recording tab.");
      }
    } catch (err) {
      setVideoPickerError(err instanceof Error ? err.message : "Failed to load library");
    } finally {
      setVideoPickerLoading(false);
    }
  };

  // Close the video picker.
  const closeVideoPicker = () => {
    setVideoPickerModuleId(null);
    setVideoPickerFiles(null);
    setVideoPickerError(null);
  };

  // Open the repo picker for a module, loading owned repos.
  const openRepoPicker = async (m: CanvasModule) => {
    setRepoPickerModuleId(m.id);
    setOwnedRepos(null);
    setRepoPickerError(null);
    setRepoPickerLoading(true);
    try {
      const r = await listGithubReposAction();
      if ("error" in r) {
        setRepoPickerError(r.error);
        setRepoPickerLoading(false);
        return;
      }
      const sorted = r.repos.map((repo) => repo.fullName).sort();
      setOwnedRepos(sorted);
      if (sorted.length === 0) {
        setRepoPickerError("No repositories found. Create one on GitHub.");
      }
    } catch (err) {
      setRepoPickerError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setRepoPickerLoading(false);
    }
  };

  // Close the repo picker.
  const closeRepoPicker = () => {
    setRepoPickerModuleId(null);
    setOwnedRepos(null);
    setRepoPickerError(null);
  };

  // Add a repo link to a module.
  const addRepoLink = async (m: CanvasModule) => {
    const repoValue = (addRepoValue[m.id] ?? "").trim();
    const title = (addRepoTitle[m.id] ?? "").trim() || repoValue;
    if (!repoValue || !repoValue.match(/^[^/\s]+\/[^/\s]+$/)) {
      setNote({ kind: "error", text: "Please enter a valid repository in owner/name format" });
      return;
    }
    setRepoPickerBusy(true);
    setNote(null);
    try {
      const result = await createModuleItemAction(
        courseUrl,
        m.id,
        {
          type: "ExternalUrl",
          externalUrl: `https://github.com/${repoValue}`,
          title,
        },
        acronym
      );
      if ("error" in result) throw new Error(result.error);
      setNote({ kind: "success", text: `Added repo link: ${title}` });
      setAddRepoValue((p) => ({ ...p, [m.id]: "" }));
      setAddRepoTitle((p) => ({ ...p, [m.id]: "" }));
      closeRepoPicker();
      reload();
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Failed to add repo link" });
    } finally {
      setRepoPickerBusy(false);
    }
  };

  // Add a video from the library to a module.
  const addVideoFromLibrary = async (m: CanvasModule, file: RecordingFile) => {
    setVideoPickerBusy(true);
    setNote(null);
    try {
      const blob = await downloadRecordingFile(supabase, file);
      const fileName = `${file.name.replace(/[^a-z0-9 _-]/gi, "_")}.${extForFile(file)}`;

      const ticket = await requestFileUploadAction(
        courseUrl,
        {
          name: fileName,
          size: blob.size,
          contentType: file.mimeType,
          folderPath: "uploads",
        },
        acronym
      );

      if ("error" in ticket) throw new Error(ticket.error);

      const form = new FormData();
      for (const [k, v] of Object.entries(ticket.ticket.uploadParams)) {
        form.append(k, v);
      }
      form.append("file", blob, fileName);

      const up = await fetch(ticket.ticket.uploadUrl, {
        method: "POST",
        body: form,
      });

      if (!up.ok) {
        throw new Error(`Upload to Canvas failed (HTTP ${up.status}).`);
      }

      const uploaded = (await up.json().catch(() => null)) as { id?: number } | null;
      if (typeof uploaded?.id !== "number") {
        throw new Error("Canvas did not return the uploaded file id.");
      }

      const result = await createModuleItemAction(
        courseUrl,
        m.id,
        { type: "File", contentId: uploaded.id, title: file.name },
        acronym
      );

      if ("error" in result) throw new Error(result.error);
      setNote({ kind: "success", text: `Added "${file.name}" to the module.` });
      closeVideoPicker();
      reload();
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Failed to add video" });
    } finally {
      setVideoPickerBusy(false);
    }
  };

  return {
    videoPickerModuleId, videoPickerFiles, videoPickerLoading, videoPickerError, videoPickerBusy,
    openVideoPicker, closeVideoPicker, addVideoFromLibrary,
    repoPickerModuleId, ownedRepos, repoPickerLoading, repoPickerError, repoPickerBusy,
    openRepoPicker, closeRepoPicker, addRepoLink,
    addRepoValue, setAddRepoValue, addRepoTitle, setAddRepoTitle,
  };
}
