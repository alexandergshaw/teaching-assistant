"use client";

// Add items to modules on an export-only course
// (docs/export-module-additions-acceptance-criteria.md) - the render half,
// rendered from ModuleCard's export branch (AC10 - NOT a widened
// `AddItemRow`, per that component's own header comment on why every one of
// its paths ends in a Canvas create; see this file's own gate below for why
// an export addition never reaches that code at all).
//
// AC11 - reuses the SAME drafting half AddItemRow's "File (AI generated)"
// type already offers (`generateDocumentTextAction`, prompt in/text out,
// into local state) rather than inventing a second AI-drafting flow -
// AddItemRow's own comment records that half was gated only because its
// RESULT had nowhere to land; an export addition's `body` is exactly that
// landing spot, so no docx/pptx conversion or upload is needed here at all -
// the generated text becomes the addition's body directly.
import { useState } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import type { LlmProvider } from "@/lib/llm";
import styles from "../../../page.module.css";
import type { DisplayModule } from "../display-module-tree";
import { LIVE_CONTENT_SOURCE, type ContentSourceContext } from "../contentSourceGating";
import { exportEditUnavailableReason } from "@/lib/export-module-additions";
import { generateDocumentTextAction } from "../../../actions";

// A representative, non-exhaustive vocabulary of the item "types" a course
// export actually contains (CartridgeModuleItem.type is free text - see
// display-module-tree.ts's own header on why it is never itself a presence
// signal) - offered as a convenience select, not a constraint enforced
// anywhere downstream.
const ADDITION_TYPES = ["Page", "Assignment", "File", "Discussion", "Quiz", "ExternalUrl", "SubHeader", "Other"] as const;

export interface ExportAddItemRowProps {
  /** The display view-model for this module - needs `m.identifier`
   * (CartridgeModule.identifier, AC3) to know which module an addition
   * targets; a module with none cannot be targeted (see the early return
   * below), the same structural discipline `AddItemRow`'s `!m.raw` check
   * uses for the live/Canvas case. */
  m: DisplayModule;
  /** Which Course Content source is active - see contentSourceGating.ts.
   * Optional, defaulted to LIVE_CONTENT_SOURCE so a call site that has not
   * wired this yet renders nothing extra (the gate below then always
   * refuses, exactly like AddItemRow's own default). */
  sourceContext?: ContentSourceContext;
  /** The course_hub row id additions persist against, or null until it has
   * resolved - see useExportModuleAdditions.ts. */
  courseId: string | null;
  provider: LlmProvider;
  /** Adds one item to `moduleRef` and persists immediately - see
   * useExportModuleAdditions.ts's own `addItem`. */
  addItem: (moduleRef: string, fields: { title: string; type: string; body?: string }) => void;
}

export type ExportAddItemRowSharedProps = Omit<ExportAddItemRowProps, "m">;

export function ExportAddItemRow({ m, sourceContext, courseId, provider, addItem }: ExportAddItemRowProps) {
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  const [title, setTitle] = useState("");
  const [type, setType] = useState<(typeof ADDITION_TYPES)[number]>("Page");
  const [body, setBody] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // AC7 - the ONE real precondition, worded and owned entirely by the pure
  // helper (mirrors DownloadSelectionSection.tsx's own precedent - never
  // `gateOperation`, see that function's own comment for why an export
  // addition is not one of `gateOperation`'s seven subjects and must never
  // become one).
  const reason = exportEditUnavailableReason(ctx.source, courseId);
  const moduleRef = m.identifier;

  if (reason || !moduleRef) {
    return (
      <div className={styles.ccAddRow}>
        <span className={styles.ccCount}>Add item</span>
        <span className={styles.ccHint}>{reason ?? "This module has no export identifier to add an item to."}</span>
      </div>
    );
  }

  const generate = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setAiError("Describe what to generate first.");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    const result = await generateDocumentTextAction(prompt, provider);
    setAiBusy(false);
    if ("error" in result) {
      setAiError(result.error);
      return;
    }
    setBody(result.text);
  };

  const canAdd = title.trim() !== "";
  const submit = () => {
    if (!canAdd) return;
    addItem(moduleRef, { title, type, body });
    setTitle("");
    setBody("");
    setAiPrompt("");
    setAiError(null);
  };

  return (
    <div className={styles.ccAddRow}>
      <span className={styles.ccCount}>Add item</span>
      <TextField
        size="small"
        sx={{ flex: "1 1 180px", minWidth: 160 }}
        placeholder="Item title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Added item title"
      />
      <TextField select size="small" sx={{ maxWidth: 150 }} value={type} onChange={(e) => setType(e.target.value as (typeof ADDITION_TYPES)[number])} aria-label="Added item type">
        {ADDITION_TYPES.map((t) => (
          <MenuItem key={t} value={t}>
            {t}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        sx={{ flex: "1 1 220px", minWidth: 180 }}
        placeholder="Describe what to generate with AI (optional)"
        value={aiPrompt}
        onChange={(e) => setAiPrompt(e.target.value)}
        aria-label="AI prompt for the added item's body"
      />
      <Button variant="outlined" size="small" disabled={aiBusy || !aiPrompt.trim()} onClick={() => void generate()}>
        {aiBusy ? "Generating…" : "Generate with AI"}
      </Button>
      <Button variant="contained" size="small" disabled={!canAdd} onClick={submit}>
        Add
      </Button>
      {aiError && (
        <span className={styles.ccHint} style={{ color: "var(--danger)" }}>
          {aiError}
        </span>
      )}
      {body.trim() !== "" && (
        <TextField
          multiline
          minRows={3}
          fullWidth
          size="small"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Added item body"
          slotProps={{ htmlInput: { spellCheck: true } }}
        />
      )}
      <span className={styles.ccHint}>
        Saved only to this export snapshot - nothing is written to Canvas, and it will not appear in a re-export
        until that half of this feature ships.
      </span>
    </div>
  );
}
