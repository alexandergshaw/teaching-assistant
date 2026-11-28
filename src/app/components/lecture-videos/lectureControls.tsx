"use client";

import { useEffect, useState } from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export const lectureStickyTop = "calc(var(--topbar-height, 58px) + var(--in-session-banner-height, 0px) + 44px)";
export const lectureSectionScrollMargin = `calc(${lectureStickyTop} + var(--lecture-feedback-height, 0px) + 16px)`;

export function focusLectureSection(id: string) {
  const target = document.getElementById(id);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: "start" });
}

export function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" component="section" id={id} tabIndex={id ? -1 : undefined} aria-labelledby={id ? `${id}-heading` : undefined}
      sx={{ p: { xs: 2, sm: 3 }, scrollMarginTop: id ? lectureSectionScrollMargin : undefined }}>
      <Stack spacing={2}>
        <Typography component="h3" variant="h6" id={id ? `${id}-heading` : undefined}>{title}</Typography>
        {children}
      </Stack>
    </Paper>
  );
}

export function UploadButton({ label, accept, multiple, disabled, onFiles }: {
  label: string;
  accept: string;
  multiple?: boolean;
  disabled: boolean;
  onFiles: (files: File[], input: HTMLInputElement) => void;
}) {
  return (
    <Button
      variant="outlined" component="label" role={undefined} tabIndex={-1} disabled={disabled}
      sx={{ alignSelf: "flex-start", "&:focus-within": { outline: "2px solid currentColor", outlineOffset: 2 } }}
    >
      {label}
      <Box
        component="input" type="file" accept={accept} multiple={multiple} disabled={disabled} aria-label={label}
        sx={{ position: "absolute", width: 1, height: "1px", overflow: "hidden", clipPath: "inset(50%)", opacity: 0 }}
        onChange={(event) => {
          const input = event.target as HTMLInputElement;
          const files = Array.from(input.files ?? []);
          input.value = "";
          if (files.length) onFiles(files, input);
        }}
      />
    </Button>
  );
}

export function useBlobUrl(blob?: Blob): string | undefined {
  const [resource, setResource] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    const url = blob ? URL.createObjectURL(blob) : undefined;
    let active = true;
    queueMicrotask(() => {
      if (active) setResource(blob && url ? { blob, url } : undefined);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blob]);
  return resource?.blob === blob ? resource?.url : undefined;
}

export function AudioPlayer({ blob, label }: { blob: Blob; label: string }) {
  const url = useBlobUrl(blob);
  return <Box component="audio" controls preload="metadata" src={url} aria-label={label} sx={{ width: "100%", maxWidth: 400 }} />;
}
