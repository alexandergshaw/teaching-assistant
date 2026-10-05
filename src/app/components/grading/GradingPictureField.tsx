"use client";

import { useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import Button from "@mui/material/Button";
import type { LlmProvider } from "@/lib/llm";
import type { RubricPictureKind } from "@/lib/grade/rubric-picture-prompt";
import { transcribeGradingPictureAction } from "@/app/actions/grading-picture-transcribe";
import { visuallyHidden } from "../ui/visuallyHidden";
import styles from "../../page.module.css";
import { ingestGradingPicture } from "./gradingPictureIngest";

interface GradingPictureFieldProps {
  kind: RubricPictureKind;
  provider: LlmProvider;
  onExtracted: (text: string) => void;
}

// N15 wave 3: picture-to-text intake for one GradingTab field. A file pick
// (camera shortcut on phones) or an image paste inside this control's own
// container is transcribed in-app and the text is handed to onExtracted.
export default function GradingPictureField({ kind, provider, onExtracted }: GradingPictureFieldProps) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setNotice(null);
    const result = await ingestGradingPicture(file, kind, (base64, k) =>
      transcribeGradingPictureAction(base64, k, provider)
    );
    setBusy(false);
    if ("text" in result) {
      onExtracted(result.text);
      setNotice({ kind: "info", message: `Filled the ${kind} from the picture. Review it before grading.` });
    } else if ("rejected" in result) {
      setNotice({ kind: "error", message: result.rejected });
    } else {
      setNotice({ kind: "error", message: result.error });
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    // Harvest synchronously, before any await.
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void handleFile(file);
  }

  const hintId = `grading-picture-${kind.replace(/\s+/g, "-")}-hint`;

  return (
    <div onPaste={handlePaste}>
      <Button
        component="label"
        role={undefined}
        tabIndex={-1}
        variant="outlined"
        size="small"
        loading={busy}
        loadingPosition="start"
      >
        {busy ? "Reading picture..." : "Add from a picture"}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          style={visuallyHidden}
          aria-describedby={hintId}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </Button>
      <span id={hintId} className={styles.fieldHint}>
        {" "}or paste a screenshot of the {kind} here
      </span>
      {notice && (
        <p
          className={styles.fieldHint}
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live={notice.kind === "error" ? "assertive" : "polite"}
        >
          {notice.message}
        </p>
      )}
    </div>
  );
}
