"use client";

import { useMemo, useRef, useState } from "react";
import { Box, Button, Checkbox, FormControlLabel, Paper, Stack, Typography } from "@mui/material";
import { Section, useBlobUrl } from "./lectureControls";
import { lectureDownloads, requestLectureDownloads, selectedLectureDownloads, setLectureDownloadSelection, type LectureDownload } from "./lecture-downloads";
import { partName, type LecturePart } from "./lectureProject";

type DownloadRowProps = {
  file: LectureDownload;
  partLabel: string;
  disabled: boolean;
  checked: boolean;
  select: (checked: boolean) => void;
  register: (id: string, anchor: HTMLAnchorElement | null) => void;
};

function DownloadRow({ file, partLabel, disabled, checked, select, register }: DownloadRowProps) {
  const url = useBlobUrl(file.blob);
  return <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
    <FormControlLabel label={<>
      <Typography component="span" variant="body2" sx={{ display: "block" }}>{file.label}</Typography>
      <Typography component="span" variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{file.fileName}</Typography>
    </>} control={<Checkbox checked={checked} onChange={(_, next) => select(next)} disabled={disabled || !url} />} />
    <Button component="a" href={url} download={file.fileName} disabled={disabled || !url}
      ref={(node: HTMLAnchorElement | null) => register(file.id, url ? node : null)}
      aria-label={`Download ${file.label} for ${partLabel}`} size="small">Download</Button>
  </Stack>;
}

export default function LectureDownloads({ parts, disabled }: { parts: LecturePart[]; disabled: boolean }) {
  const groups = useMemo(() => parts.map((part, index) => ({ id: part.id, label: `Part ${index + 1}: ${partName(part, index)}`, files: lectureDownloads(part, index) })), [parts]);
  const files = groups.flatMap((group) => group.files);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [status, setStatus] = useState("");
  const anchors = useRef(new Map<string, HTMLAnchorElement>());
  const selected = selectedLectureDownloads(files, chosen);

  function register(id: string, anchor: HTMLAnchorElement | null) {
    if (anchor) anchors.current.set(id, anchor);
    else anchors.current.delete(id);
  }

  function select(items: LectureDownload[], checked: boolean) {
    setChosen((previous) => setLectureDownloadSelection(previous, items.map((item) => item.id), checked));
    setStatus("");
  }

  function downloadSelected() {
    const requested = requestLectureDownloads(selected, anchors.current);
    if (!requested) setStatus("The selected files are still loading. Try again in a moment.");
    else if (requested < selected.length) setStatus(`Requested ${requested} of ${selected.length} files. Try the remaining files individually.`);
    else setStatus(`Requested ${requested} separate ${requested === 1 ? "download" : "downloads"}.`);
  }

  if (!files.length) return null;
  return <Box id="lecture-downloads" tabIndex={-1} sx={{ scrollMarginTop: 16 }}>
    <Section title="Downloads">
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { xs: "start", sm: "center" } }}>
        <FormControlLabel label="Select all ready files" control={<Checkbox disabled={disabled}
          checked={selected.length === files.length} indeterminate={selected.length > 0 && selected.length < files.length}
          onChange={(_, checked) => select(files, checked)} />} />
        <Button variant="contained" disabled={disabled || !selected.length} onClick={downloadSelected}>
          Download selected{selected.length ? ` (${selected.length})` : ""}
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">Selected files download separately. If your browser blocks multiple downloads, allow them or use the individual Download buttons.</Typography>
      <Typography variant="body2" color="text.secondary">A VTT file is a separate, toggleable caption track. Burned-in captions are always visible in the video.</Typography>
      {status && <Typography role="status" variant="body2">{status}</Typography>}
      {groups.filter((group) => group.files.length).map((group) => {
        const count = selectedLectureDownloads(group.files, chosen).length;
        return <Paper key={group.id} component="fieldset" variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
          <Typography component="legend" variant="subtitle2" sx={{ px: 0.75 }}>{group.label}</Typography>
          {groups.length > 1 && <FormControlLabel label={`Select all files for ${group.label}`} control={<Checkbox
            disabled={disabled} checked={count === group.files.length} indeterminate={count > 0 && count < group.files.length}
            onChange={(_, checked) => select(group.files, checked)} />} />}
          {group.files.map((file) => <DownloadRow key={file.id} file={file} partLabel={group.label} disabled={disabled}
            checked={chosen.has(file.id)} select={(checked) => select([file], checked)} register={register} />)}
        </Paper>;
      })}
    </Section>
  </Box>;
}
