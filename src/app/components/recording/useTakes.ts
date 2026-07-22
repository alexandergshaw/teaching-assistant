"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DirHandle } from "@/lib/backup-dir";
import { loadBackupDir, writeToBackupDir } from "@/lib/backup-dir";
import { saveRecordingFile } from "@/lib/recording-files";
import { extractAudioOnly } from "@/lib/strip-audio";
import type { Take } from "./types";

export interface UseTakesReturn {
  takes: Take[];
  setTakes: React.Dispatch<React.SetStateAction<Take[]>>;
  takeNameDrafts: Record<string, string>;
  setTakeNameDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  extractingAudioId: string | null;
  setExtractingAudioId: React.Dispatch<React.SetStateAction<string | null>>;
  backupDir: DirHandle | null;
  setBackupDir: (value: DirHandle | null) => void;
  backupDirRef: React.MutableRefObject<DirHandle | null>;
  supabaseRef: React.MutableRefObject<SupabaseClient<Database> | null>;
  userRef: React.MutableRefObject<User | null>;
  takesRef: React.MutableRefObject<Take[]>;
  saveTakeName: (take: Take) => void;
  handleDownload: (take: Take) => void;
  handleDelete: (id: string) => void;
  saveTakeToLibrary: (take: Take, blob: Blob) => Promise<void>;
  addRecordedTake: (take: Take, blob: Blob) => void;
  handleExtractAudio: (take: Take) => Promise<void>;
}

export function useTakes({
  supabase,
  user,
  setError,
}: {
  supabase: SupabaseClient<Database> | null;
  user: User | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}): UseTakesReturn {
  const [takes, setTakes] = useState<Take[]>([]);

  // Rename drafts state for takes (in-memory only)
  const [takeNameDrafts, setTakeNameDrafts] = useState<Record<string, string>>({});

  // Audio extraction state
  const [extractingAudioId, setExtractingAudioId] = useState<string | null>(null);

  // Feature 2: Backup folder
  const [backupDir, setBackupDir] = useState<DirHandle | null>(null);

  // Refs for mirroring state into function reads
  const backupDirRef = useRef<DirHandle | null>(null);
  const supabaseRef = useRef<SupabaseClient<Database> | null>(null);
  const userRef = useRef<User | null>(null);

  // Mirror Feature 2: backup dir ref
  useEffect(() => {
    backupDirRef.current = backupDir;
  }, [backupDir]);

  // Mirror supabase and user into refs for recorder.onstop
  useEffect(() => {
    supabaseRef.current = supabase;
  }, [supabase]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Load backup directory from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const h = await loadBackupDir();
      if (!cancelled) setBackupDir(h);
    })();
    return () => { cancelled = true; };
  }, []);

  const saveTakeName = (take: Take) => {
    const draft = takeNameDrafts[take.id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === take.name) {
      setTakeNameDrafts((prev) => {
        const next = { ...prev };
        delete next[take.id];
        return next;
      });
      return;
    }
    // Renaming a take does not rename the copy already saved to the library (they are separate records).
    setTakes((prev) =>
      prev.map((t) => (t.id === take.id ? { ...t, name: trimmed } : t))
    );
    setTakeNameDrafts((prev) => {
      const next = { ...prev };
      delete next[take.id];
      return next;
    });
  };

  const handleDownload = (take: Take) => {
    let ext: string;
    if (take.mimeType.startsWith("audio/")) {
      ext = take.mimeType.includes("mp4") ? "m4a" : "webm";
    } else {
      ext = take.mimeType.includes("mp4") ? "mp4" : "webm";
    }
    const safeName = take.name.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
    const a = document.createElement("a");
    a.href = take.url;
    a.download = `${safeName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = (id: string) => {
    setTakes((prev) => {
      const take = prev.find((t) => t.id === id);
      if (take) {
        URL.revokeObjectURL(take.url);
      }
      return prev.filter((t) => t.id !== id);
    });
  };

  const saveTakeToLibrary = async (take: Take, blob: Blob) => {
    // Backup to folder
    if (backupDirRef.current) {
      const newTake = { ...take, backup: "pending" as const };
      setTakes((prev) => prev.map((t) => t.id === take.id ? newTake : t));
      try {
        const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
        const ext = blob.type.includes("mp4") ? (blob.type.startsWith("audio/") ? "m4a" : "mp4") : "webm";
        const safeName = take.name.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
        await writeToBackupDir(backupDirRef.current!, `${safeName}-${stamp}.${ext}`, blob);
        setTakes((prev) => prev.map((t) => t.id === take.id ? { ...t, backup: "done" as const } : t));
      } catch (err) {
        console.error("Backup failed:", err);
        setTakes((prev) => prev.map((t) => t.id === take.id ? { ...t, backup: "failed" as const } : t));
      }
    }

    // Save to Supabase library
    if (userRef.current && supabaseRef.current) {
      const newTake = { ...take, dbSave: "pending" as const };
      setTakes((prev) => prev.map((t) => t.id === take.id ? newTake : t));
      try {
        await saveRecordingFile(supabaseRef.current!, userRef.current!.id, blob, {
          name: take.name,
          kind: "recording",
          mimeType: blob.type,
          durationSec: take.durationSec,
        });
        setTakes((prev) => prev.map((t) => t.id === take.id ? { ...t, dbSave: "done" as const } : t));
      } catch (err) {
        console.error("Save to library failed:", err);
        setTakes((prev) => prev.map((t) => t.id === take.id ? { ...t, dbSave: "failed" as const } : t));
      }
    }
  };

  // Unmount-only cleanup. Latest takes are read through refs so
  // this never re-runs (a deps-based cleanup would kill the stream and revoke
  // take URLs every time a take is added).
  const takesRef = useRef(takes);
  useEffect(() => {
    takesRef.current = takes;
  }, [takes]);

  const addRecordedTake = (take: Take, blob: Blob) => {
    setTakes((prev) => [...prev, take]);
    void saveTakeToLibrary(take, blob);
  };

  const handleExtractAudio = async (take: Take) => {
    if (extractingAudioId === take.id) return;
    setExtractingAudioId(take.id);
    try {
      const response = await fetch(take.url);
      const blob = await response.blob();
      const audioBlob = await extractAudioOnly(blob, (pct) => {
        if (pct % 10 === 0) {
          setExtractingAudioId(`${take.id}|${pct}`);
        }
      });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioTake: Take = {
        id: crypto.randomUUID(),
        name: `${take.name} (audio)`,
        url: audioUrl,
        mimeType: audioBlob.type || "audio/webm",
        sizeBytes: audioBlob.size,
        durationSec: take.durationSec,
        createdAt: Date.now(),
      };
      setTakes((prev) => [...prev, audioTake]);
      void saveTakeToLibrary(audioTake, audioBlob);
    } catch (err) {
      console.error("Audio extraction failed:", err);
      setError(`Audio extraction failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setExtractingAudioId(null);
    }
  };

  return {
    takes,
    setTakes,
    takeNameDrafts,
    setTakeNameDrafts,
    extractingAudioId,
    setExtractingAudioId,
    backupDir,
    setBackupDir,
    backupDirRef,
    supabaseRef,
    userRef,
    takesRef,
    saveTakeName,
    handleDownload,
    handleDelete,
    saveTakeToLibrary,
    addRecordedTake,
    handleExtractAudio,
  };
}
