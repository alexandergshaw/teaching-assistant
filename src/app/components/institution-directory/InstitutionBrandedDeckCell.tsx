"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Stack, Typography } from "@mui/material";
import { downloadInstitutionDeckAction, finishInstitutionDeckUploadAction, startInstitutionDeckUploadAction } from "@/app/actions/institution-branded-decks";
import { INSTITUTION_BRANDED_DECKS_BUCKET, institutionDeckFile, type InstitutionBrandedDeck } from "@/lib/institution-branded-decks";
import { createClient } from "@/lib/supabase/client";
import { downloadInstitutionDeckFile } from "./download-institution-deck";

type Props = {
  account: string;
  acronym: string;
  files: readonly InstitutionBrandedDeck[];
  disabled: boolean;
  getProfileGeneration: () => number;
  onUploaded: (file: InstitutionBrandedDeck, generation: number) => void;
};

export default function InstitutionBrandedDeckCell({ account, acronym, files, disabled, getProfileGeneration, onUploaded }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const lifetime = useRef<AbortController | null>(null);
  const working = useRef(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  async function upload(selected: File[]) {
    const signal = lifetime.current?.signal;
    if (disabled || working.current || !signal || !selected.length) return;
    const generation = getProfileGeneration();
    working.current = true;
    setErrors([]);
    try {
      for (const file of selected) {
        if (signal.aborted || getProfileGeneration() !== generation) break;
        setProgress(`Uploading ${file.name}…`);
        try {
          const metadata = institutionDeckFile(file.name, file.size);
          if (!metadata) throw new Error("Choose a .pptx or .potx file up to 25 MB with a valid file name.");
          const upload = await startInstitutionDeckUploadAction(account, acronym, metadata.name, metadata.size);
          if (signal.aborted) break;
          if ("error" in upload) throw new Error(upload.error);
          const body = new File([file], metadata.name, { type: upload.contentType });
          const transfer = await createClient().storage.from(INSTITUTION_BRANDED_DECKS_BUCKET)
            .uploadToSignedUrl(upload.path, upload.token, body, { upsert: false, cacheControl: "0" })
            .catch(() => null);
          // A transfer may commit before its response is lost. Try to finish
          // this same key, even after unmount, instead of uploading a new one.
          const result = await finishInstitutionDeckUploadAction(account, acronym, upload.id, metadata.name, metadata.size);
          if (signal.aborted) break;
          if ("error" in result) {
            throw new Error(!transfer || transfer.error ? "Could not confirm the upload. Try again." : result.error);
          }
          onUploaded(result.file, generation);
        } catch (error) {
          if (!signal.aborted) {
            const message = error instanceof Error ? error.message : "Could not upload the file.";
            setErrors((current) => [...current, `${file.name}: ${message}`]);
          }
        }
      }
    } finally {
      working.current = false;
      if (!signal.aborted) setProgress(null);
    }
  }

  async function download(file: InstitutionBrandedDeck) {
    const signal = lifetime.current?.signal;
    if (disabled || working.current || !signal) return;
    working.current = true;
    setProgress(`Preparing ${file.name}…`);
    setErrors([]);
    try {
      const result = await downloadInstitutionDeckAction(account, acronym, file.id);
      if (signal.aborted) return;
      if ("error" in result) throw new Error(result.error);
      await downloadInstitutionDeckFile(result.url, file, signal);
    } catch (error) {
      if (!signal.aborted) setErrors([error instanceof Error ? error.message : "Could not open that slide deck. Try again."]);
    } finally {
      working.current = false;
      if (!signal.aborted) setProgress(null);
    }
  }

  const controlsDisabled = disabled || Boolean(progress);
  return (
    <Stack spacing={0.5} sx={{ minWidth: 190, maxWidth: 300, alignItems: "flex-start" }}>
      {files.map((file) => <Button key={file.id} size="small" disabled={controlsDisabled} onClick={() => void download(file)}
        aria-label={`Download ${file.name} for ${acronym}`} sx={{ textAlign: "start", overflowWrap: "anywhere" }}>{file.name}</Button>)}
      <Button size="small" variant="outlined" disabled={controlsDisabled} onClick={() => picker.current?.click()}
        aria-label={`Upload slide decks for ${acronym}`}>Upload PowerPoint</Button>
      <input ref={picker} type="file" hidden multiple accept=".pptx,.potx" disabled={controlsDisabled} onChange={(event) => {
        const selected = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        void upload(selected);
      }} />
      {progress && <Typography variant="caption" role="status">{progress}</Typography>}
      {errors.length > 0 && <Stack role="alert" spacing={0.5}>{errors.map((error, index) => (
        <Typography key={index} variant="caption" color="error" sx={{ overflowWrap: "anywhere" }}>{error}</Typography>
      ))}</Stack>}
    </Stack>
  );
}
