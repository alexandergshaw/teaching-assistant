import { useCallback, useEffect, useState } from "react";
import { listBackupVideos, readBackupFile, type BackupVideo, type DirHandle } from "@/lib/backup-dir";
import { listRecordingFiles, downloadRecordingFile, extForMime, type RecordingFile } from "@/lib/recording-files";
import { useSupabase } from "@/context/SupabaseProvider";
import type { Take } from "../../RecordingTab";

export function useVideoImport() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [folderVideos, setFolderVideos] = useState<BackupVideo[] | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [libraryVideos, setLibraryVideos] = useState<RecordingFile[] | null>(null);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);

  const { supabase, user } = useSupabase();

  const adoptVideo = useCallback((blob: Blob, name: string) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setFileName(name);
    setImportError(null);
  }, [videoUrl]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    adoptVideo(file, file.name);
  }, [adoptVideo]);

  const handleImportTake = async (take: Take) => {
    setImportingKey("take:" + take.id);
    try {
      const blob = await (await fetch(take.url)).blob();
      const ext = take.mimeType.includes("mp4") ? "mp4" : "webm";
      adoptVideo(blob, take.name + "." + ext);
    } catch {
      setImportError("Could not load that take.");
    } finally {
      setImportingKey(null);
    }
  };

  const handleBrowseFolder = async (backupDir: DirHandle | null) => {
    if (!backupDir) return;
    setFolderBusy(true);
    setImportError(null);
    try {
      setFolderVideos(await listBackupVideos(backupDir));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read the backup folder.");
    } finally {
      setFolderBusy(false);
    }
  };

  const handleImportFolderVideo = async (backupDir: DirHandle | null, name: string) => {
    if (!backupDir) return;
    setImportingKey("file:" + name);
    try {
      const file = await readBackupFile(backupDir, name);
      adoptVideo(file, file.name);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setImportingKey(null);
    }
  };

  const loadLibrary = useCallback(async () => {
    if (!supabase || !user) return;
    setLibraryBusy(true);
    setImportError(null);
    try {
      const files = await listRecordingFiles(supabase, user.id);
      setLibraryVideos(files);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not load library.");
    } finally {
      setLibraryBusy(false);
    }
  }, [supabase, user]);

  useEffect(() => {
    if (user && supabase && libraryVideos === null && !libraryBusy) {
      let cancelled = false;
      (async () => {
        setLibraryBusy(true);
        setImportError(null);
        try {
          const files = await listRecordingFiles(supabase, user.id);
          if (!cancelled) {
            setLibraryVideos(files);
          }
        } catch (err) {
          if (!cancelled) {
            setImportError(err instanceof Error ? err.message : "Could not load library.");
          }
        } finally {
          if (!cancelled) {
            setLibraryBusy(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [user, supabase, libraryVideos, libraryBusy]);

  const handleImportLibraryVideo = async (file: RecordingFile) => {
    setImportingKey("lib:" + file.id);
    try {
      const blob = await downloadRecordingFile(supabase, file);
      adoptVideo(blob, file.name + "." + extForMime(file.mimeType));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not load that video.");
    } finally {
      setImportingKey(null);
    }
  };

  return {
    videoUrl,
    setVideoUrl,
    fileName,
    setFileName,
    folderVideos,
    setFolderVideos,
    folderBusy,
    libraryVideos,
    setLibraryVideos,
    libraryBusy,
    importError,
    setImportError,
    importingKey,
    adoptVideo,
    handleFileChange,
    handleImportTake,
    handleBrowseFolder,
    handleImportFolderVideo,
    loadLibrary,
    handleImportLibraryVideo,
  };
}
