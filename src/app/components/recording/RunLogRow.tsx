"use client";

// docs/recording-controls-ux-acceptance-criteria.md CC8: the run-log row was
// byte-identical in five files (DiscussionRepliesPanel.tsx:578-586,
// GradingRecordingPanel.tsx:547-554, LegibilityProbeModal.tsx:247-255,
// ModuleDeckCapturePanel.tsx:656-664, TakeAnnouncementPanel.tsx:190-197) - a
// summary span plus two text Buttons downloading CSV/JSON. Placement is
// unchanged: directly under each panel's header.
import { Button } from "@mui/material";
import controls from "./RecordingControls.module.css";

const FORMAT_LABEL: Record<"csv" | "json", string> = { csv: "CSV", json: "JSON" };

export interface RunLogRowProps {
  summary: string;
  onDownload: (format: "csv" | "json") => void;
  /** Defaults to both formats. */
  formats?: readonly ("csv" | "json")[];
}

export default function RunLogRow({ summary, onDownload, formats = ["csv", "json"] }: RunLogRowProps) {
  return (
    <div className={controls.runLogRow}>
      <span>{summary}</span>
      {formats.map((format) => (
        <Button key={format} variant="text" size="small" onClick={() => onDownload(format)}>
          {`Download run log (${FORMAT_LABEL[format]})`}
        </Button>
      ))}
    </div>
  );
}
