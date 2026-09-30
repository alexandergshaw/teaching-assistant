"use client";

// Presentations > Slide Deck Pipeline (PRES-2 S6.7, RES-S6-A): the
// stage-gated surface for the full 13-stage pipeline
// (docs/pres-2-s6-plan.md), wired to the verified pipeline core (S6.3's
// pipeline.ts, S6.6's panel-logic.ts) and the verified route (S6.5). Stays
// alongside the shipped thin "Slide Deck Creation" flow (index.tsx) as a
// second, more thorough path - F1/F3 (owner decisions): stage-gated by
// default, with a run-to-end option.
//
// RUN-TO-END EXECUTOR (F3): a client-driven SEQUENTIAL fan-out, never one
// route call for every stage (the never-loop contract). `runToEnd` (S6.6)
// returns the runnable FRONTIER for the state it was given; this component
// runs each frontier stage in order, folds the response into a new state via
// `reducePipelineResponse`/`applyStageEdit`, and re-calls `runToEnd` on the
// result until the frontier is empty. Three stage kinds, dispatched
// differently (I1, S6.6's panel-logic.ts comment):
//   - "sources" is a USER COMMIT gate (the instructor edits sources; nothing
//     auto-runs it) - the loop stops rather than spins if it is the only
//     thing left in the frontier.
//   - "standard"/"polish" are PURE LOCAL compute (`checkDeckStandard`/
//     `polishDeck`, imported straight from the deck-standard leaves) - no
//     route call.
//   - every other stage is a route-op stage - ONE POST per call
//     (`buildPipelineRequest`/`/api/presentations/pipeline`), respecting the
//     60s-per-call cap.
//
// regen-slide (per-slide edit) is gated on `deck.status === "done"` (I3),
// never merely `canRunStage("deck")` - buildPipelineRequest("regen-slide")
// throws on a null deck otherwise.
//
// OWNER-VERIFICATION (nothing renders under vitest - node-env, no component
// mounted by any test here): the stepper's actual rendering, drag-and-drop
// file intake (SourcesEditor), the deck preview, the .pptx download opening
// correctly, run-to-end producing a good deck, the click budget walked live,
// and whether the model stays on-Frame / the review findings are genuinely
// adversarial. See docs/pres-2-s6-plan.md section 8 / RES-S6-B/C/F.

import { useState } from "react";
import { Alert, Button, Card, CardContent, Divider, MenuItem, TextField, Typography } from "@mui/material";
import TabHeader from "../../TabHeader";
import SourcesEditor from "../SourcesEditor";
import SlideDeckPreview from "../SlideDeckPreview";
import { usePersistedJSON } from "../hooks";
import { deckDownloadFilename } from "../panel-logic";
import type { PresentationSource } from "@/lib/presentations/types";
import {
  ALL_STAGE_IDS,
  createInitialPipelineState,
  type PipelineOp,
  type PipelineState,
  type StageId,
} from "@/lib/presentations/pipeline";
import { applyStageEdit, buildPipelineRequest, reducePipelineResponse, runToEnd } from "./panel-logic";
import { buildMergedReview } from "./merged-review";
import { reduceAskResponse } from "../../ppt-design/ask-response";
import { checkDeckStandard, DECK_STANDARD_V1 } from "@/lib/deck-standard/standard";
import { polishDeck } from "@/lib/deck-standard/polish";
import { validateSlidePlan, type SlidePlanEntry } from "@/lib/deck-standard/slide-plan";
import { INFO_FLOW_CHECKLIST, VISUAL_CHECKLIST, type Checklist } from "@/lib/deck-standard/checklists";
import PipelineStepper, { STAGE_LABELS } from "./PipelineStepper";
import FrameEditor from "./FrameEditor";
import ReviewFindings from "./ReviewFindings";

const PIPELINE_URL = "/api/presentations/pipeline";
const PIPELINE_STATE_KEY = "ta-pres-pipeline-state";
const PIPELINE_CONTEXT_KEY = "ta-pres-pipeline-context-text";
const PIPELINE_SOURCES_KEY = "ta-pres-pipeline-sources";

// The route-op each auto-runnable stage maps to (S6.6's inverse table,
// panel-logic.ts's OP_TO_STAGE, restated here from the stage's side since
// this is the caller deciding HOW to run a stage, not reducing its response).
// "sources"/"standard"/"polish" are deliberately absent - they are dispatched
// by their own mechanism, never through this table (I1).
const STAGE_TO_OP: Partial<Record<StageId, Exclude<PipelineOp, "regen-slide">>> = {
  outline: "outline",
  frame: "frame-suggest",
  activities: "activities",
  plan: "plan",
  deck: "deck",
  reviewInfoFlow: "review-infoflow",
  reviewVisual: "review-visual",
};

async function callPipelineRoute(
  op: Exclude<PipelineOp, "regen-slide">,
  state: PipelineState,
  contextText: string
): Promise<PipelineState> {
  const request = buildPipelineRequest(op, state, contextText);
  const res = await fetch(PIPELINE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await res.json().catch(() => undefined);
  return reducePipelineResponse(op, res.status, body, state);
}

// S6.7 gap closer (S6.7-flagged): the checklist each review stage's
// deterministic pass runs against, matching the stage's own route op.
const REVIEW_STAGE_CHECKLIST: Record<"reviewInfoFlow" | "reviewVisual", Checklist> = {
  reviewInfoFlow: INFO_FLOW_CHECKLIST,
  reviewVisual: VISUAL_CHECKLIST,
};

/**
 * Runs one review stage (reviewInfoFlow/reviewVisual): POSTs the LLM route
 * op exactly as before, then - only on a genuine success (the stage lands
 * "done" with an LLM ChecklistResult) - ALSO runs the matching deterministic
 * checklist locally (pure, no fetch) against the current deck and merges the
 * two via `buildMergedReview` (review-merge.ts's
 * mergeWithDeterministicChecklist) so the stored artifact's `ranItemIds` is a
 * completeness receipt for the WHOLE checklist, not just the llm half. A
 * failed/malformed route response is left exactly as `reducePipelineResponse`
 * produced it (the stage marked "error") - never merged as if it were a
 * success.
 */
async function runReviewStage(
  stage: "reviewInfoFlow" | "reviewVisual",
  op: Extract<PipelineOp, "review-infoflow" | "review-visual">,
  state: PipelineState,
  contextText: string
): Promise<PipelineState> {
  const next = await callPipelineRoute(op, state, contextText);
  if (next[stage].status !== "done") return next;
  const llmResult = next[stage].artifact;
  if (!llmResult) return next;
  const merged = buildMergedReview(REVIEW_STAGE_CHECKLIST[stage], state.deck.artifact, llmResult);
  return applyStageEdit(next, stage, merged);
}

/** Runs one stage against `state`, returning the next state. "sources" is a no-op here (user-commit gate). */
async function runStage(stage: StageId, state: PipelineState, contextText: string): Promise<PipelineState> {
  if (stage === "sources") return state;
  if (stage === "standard") {
    const deck = state.deck.artifact;
    if (!deck) return state;
    return applyStageEdit(state, "standard", checkDeckStandard(deck, DECK_STANDARD_V1));
  }
  if (stage === "polish") {
    const deck = state.deck.artifact;
    if (!deck) return state;
    return applyStageEdit(state, "polish", polishDeck(deck));
  }
  if (stage === "reviewInfoFlow") return runReviewStage(stage, "review-infoflow", state, contextText);
  if (stage === "reviewVisual") return runReviewStage(stage, "review-visual", state, contextText);
  const op = STAGE_TO_OP[stage];
  if (!op) return state;
  return callPipelineRoute(op, state, contextText);
}

export default function PipelineTab() {
  const [pipelineState, setPipelineState] = usePersistedJSON<PipelineState>(
    PIPELINE_STATE_KEY,
    createInitialPipelineState()
  );
  const [contextText, setContextText] = usePersistedJSON<string>(PIPELINE_CONTEXT_KEY, "");
  const [sourcesDraft, setSourcesDraft] = usePersistedJSON<PresentationSource[]>(PIPELINE_SOURCES_KEY, []);
  const [activeStage, setActiveStage] = useState<StageId>("sources");
  const [runningStage, setRunningStage] = useState<StageId | null>(null);
  const [runningToEnd, setRunningToEnd] = useState(false);
  const [regenSlideIndex, setRegenSlideIndex] = useState(0);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [askInstruction, setAskInstruction] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askOutcome, setAskOutcome] = useState<{ severity: "warning" | "error"; text: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function runOneStage(stage: StageId) {
    setRunningStage(stage);
    try {
      const next = await runStage(stage, pipelineState, contextText);
      setPipelineState(next);
    } finally {
      setRunningStage(null);
    }
  }

  async function handleRunToEnd() {
    setRunningToEnd(true);
    try {
      let current = pipelineState;
      // Bounded by the stage count - the invalidation graph is a DAG
      // (pipeline.ts), so a full pass can visit each stage at most once per
      // loop iteration; this guard is a last-resort safety net, not the
      // expected exit.
      for (let guard = 0; guard <= ALL_STAGE_IDS.length; guard++) {
        const frontier = runToEnd(current);
        // "sources" never auto-runs (I1: a user-commit gate) - if it is the
        // only thing left, everything downstream is blocked on the
        // instructor's own action, so stop rather than spin.
        const runnable = frontier.filter((stage) => stage !== "sources");
        if (runnable.length === 0) break;
        for (const stage of runnable) {
          setRunningStage(stage);
          current = await runStage(stage, current, contextText);
          setPipelineState(current);
          if (current[stage].status === "error") {
            return; // stop the fan-out on a failure (finally below still fires)
          }
        }
      }
    } finally {
      setRunningStage(null);
      setRunningToEnd(false);
    }
  }

  function commitSources() {
    setPipelineState((prev) => applyStageEdit(prev, "sources", sourcesDraft));
  }

  async function handleRegenSlide() {
    // I3: gate on deck.status === "done", not merely canRunStage("deck") -
    // buildPipelineRequest("regen-slide") throws on a null deck otherwise.
    if (pipelineState.deck.status !== "done" || regenInstruction.trim() === "") return;
    setRunningStage("deck");
    try {
      const request = buildPipelineRequest("regen-slide", pipelineState, contextText, {
        slideIndex: regenSlideIndex,
        instruction: regenInstruction,
      });
      const res = await fetch(PIPELINE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await res.json().catch(() => undefined);
      const next = reducePipelineResponse("regen-slide", res.status, body, pipelineState);
      setPipelineState(next);
      setRegenInstruction("");
    } finally {
      setRunningStage(null);
    }
  }

  async function handleApplyToDeck() {
    const deck = pipelineState.deck.artifact;
    if (!deck || askInstruction.trim() === "") return;
    setAskBusy(true);
    setAskOutcome(null);
    try {
      const res = await fetch("/api/decks/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: askInstruction, slides: deck.slides }),
      });
      const body: unknown = await res.json().catch(() => undefined);
      const outcome = reduceAskResponse(res.status, body);
      if (outcome.phase === "ok") {
        setPipelineState((prev) =>
          applyStageEdit(prev, "deck", { presentationTitle: deck.presentationTitle, slides: outcome.slides })
        );
        setAskInstruction("");
        setAskOutcome(null);
      } else if (outcome.phase === "refused") {
        setAskOutcome({ severity: "warning", text: outcome.reason });
      } else {
        setAskOutcome({ severity: "error", text: outcome.message });
      }
    } finally {
      setAskBusy(false);
    }
  }

  async function handleDownload() {
    const deck = pipelineState.deck.artifact;
    if (!deck) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const { serializeDeckToPptx } = await import("@/lib/presentations/deck-file");
      const buffer = await serializeDeckToPptx(deck);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = deckDownloadFilename(deck.presentationTitle);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Could not build the .pptx");
    } finally {
      setDownloading(false);
    }
  }

  function addPlanEntry(role: SlidePlanEntry["role"]) {
    const plan = pipelineState.plan.artifact ?? { entries: [] };
    const entry: SlidePlanEntry =
      role === "content"
        ? { role: "content", dominantClaim: "" }
        : { role, dominantClaim: "", predictionId: `pred-${plan.entries.length + 1}` };
    setPipelineState((prev) => applyStageEdit(prev, "plan", { entries: [...plan.entries, entry] }));
  }

  function updatePlanEntry(index: number, patch: Partial<SlidePlanEntry>) {
    const plan = pipelineState.plan.artifact;
    if (!plan) return;
    const entries = plan.entries.map((e, i) => (i === index ? ({ ...e, ...patch } as SlidePlanEntry) : e));
    setPipelineState((prev) => applyStageEdit(prev, "plan", { entries }));
  }

  function removePlanEntry(index: number) {
    const plan = pipelineState.plan.artifact;
    if (!plan) return;
    setPipelineState((prev) =>
      applyStageEdit(prev, "plan", { entries: plan.entries.filter((_, i) => i !== index) })
    );
  }

  const busy = runningStage !== null || runningToEnd;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <TabHeader
        eyebrow="Presentations"
        title="Slide Deck Pipeline"
        subtitle="Work through all 13 stages one at a time, with an editable intermediate at every step, or run to the end."
      />

      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        <Button variant="contained" onClick={handleRunToEnd} disabled={busy} sx={{ textTransform: "none" }}>
          {runningToEnd ? "Running to end..." : "Run to end"}
        </Button>
        {runningStage && <Typography variant="body2">Running: {STAGE_LABELS[runningStage]}</Typography>}
      </div>

      <PipelineStepper state={pipelineState} activeStage={activeStage} onSelectStage={setActiveStage} />

      <Card variant="outlined">
        <CardContent style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Typography variant="h6">{STAGE_LABELS[activeStage]}</Typography>
          <Divider />

          {activeStage === "sources" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <SourcesEditor
                text={contextText}
                onTextChange={setContextText}
                sources={sourcesDraft}
                onSourcesChange={setSourcesDraft}
              />
              <Button
                variant="contained"
                onClick={commitSources}
                sx={{ textTransform: "none", alignSelf: "start" }}
              >
                Commit sources
              </Button>
            </div>
          )}

          {activeStage === "outline" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <TextField
                label="Outline (markdown)"
                multiline
                rows={10}
                fullWidth
                value={pipelineState.outline.artifact?.markdown ?? ""}
                onChange={(e) =>
                  setPipelineState((prev) => applyStageEdit(prev, "outline", { markdown: e.target.value }))
                }
              />
              <Button
                variant="outlined"
                onClick={() => runOneStage("outline")}
                disabled={busy}
                sx={{ textTransform: "none", alignSelf: "start" }}
              >
                Generate outline
              </Button>
            </div>
          )}

          {activeStage === "activities" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <TextField
                label="Activity ideas (one per line)"
                multiline
                rows={6}
                fullWidth
                value={(pipelineState.activities.artifact?.ideas ?? []).join("\n")}
                onChange={(e) =>
                  setPipelineState((prev) =>
                    applyStageEdit(prev, "activities", {
                      ideas: e.target.value.split("\n").filter((line) => line.trim().length > 0),
                    })
                  )
                }
              />
              <Button
                variant="outlined"
                onClick={() => runOneStage("activities")}
                disabled={busy}
                sx={{ textTransform: "none", alignSelf: "start" }}
              >
                Generate activities
              </Button>
            </div>
          )}

          {activeStage === "frame" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <FrameEditor
                // Remounts (re-seeding the draft) whenever the COMMITTED
                // frame changes underneath - e.g. "Suggest a frame via AI"
                // landing - instead of FrameEditor syncing state from a prop
                // in an effect (see that component's own comment).
                key={JSON.stringify(pipelineState.frame.artifact)}
                frame={pipelineState.frame.artifact}
                onCommit={(next) => setPipelineState((prev) => applyStageEdit(prev, "frame", next))}
              />
              <Button
                variant="outlined"
                onClick={() => runOneStage("frame")}
                disabled={busy}
                sx={{ textTransform: "none", alignSelf: "start" }}
              >
                Suggest a frame via AI
              </Button>
            </div>
          )}

          {activeStage === "plan" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {(pipelineState.plan.artifact?.entries ?? []).map((entry, idx) => (
                <div key={idx} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                  <TextField
                    select
                    label="Role"
                    size="small"
                    value={entry.role}
                    onChange={(e) => updatePlanEntry(idx, { role: e.target.value as SlidePlanEntry["role"] })}
                    style={{ minWidth: 140 }}
                  >
                    <MenuItem value="content">Content</MenuItem>
                    <MenuItem value="prediction">Prediction</MenuItem>
                    <MenuItem value="answer">Answer</MenuItem>
                  </TextField>
                  <TextField
                    label="Dominant claim"
                    size="small"
                    fullWidth
                    value={entry.dominantClaim}
                    onChange={(e) => updatePlanEntry(idx, { dominantClaim: e.target.value })}
                  />
                  {entry.role !== "content" && (
                    <TextField
                      label="Prediction id"
                      size="small"
                      value={entry.predictionId}
                      onChange={(e) => updatePlanEntry(idx, { predictionId: e.target.value })}
                    />
                  )}
                  <Button size="small" onClick={() => removePlanEntry(idx)} sx={{ textTransform: "none" }}>
                    Remove
                  </Button>
                </div>
              ))}
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Button size="small" variant="outlined" onClick={() => addPlanEntry("content")} sx={{ textTransform: "none" }}>
                  Add content slide
                </Button>
                <Button size="small" variant="outlined" onClick={() => addPlanEntry("prediction")} sx={{ textTransform: "none" }}>
                  Add prediction
                </Button>
                <Button size="small" variant="outlined" onClick={() => addPlanEntry("answer")} sx={{ textTransform: "none" }}>
                  Add answer
                </Button>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Button variant="outlined" onClick={() => runOneStage("plan")} disabled={busy} sx={{ textTransform: "none" }}>
                  Generate plan
                </Button>
              </div>
              {pipelineState.plan.artifact && (
                <ReviewFindings
                  ranComplete
                  emptyLabel="The plan is well-formed."
                  items={validateSlidePlan(pipelineState.plan.artifact).map((v) => ({
                    slideIndex: v.index,
                    message: v.detail,
                  }))}
                />
              )}
            </div>
          )}

          {activeStage === "deck" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Button variant="outlined" onClick={() => runOneStage("deck")} disabled={busy} sx={{ textTransform: "none" }}>
                  Generate deck
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleDownload}
                  disabled={downloading || !pipelineState.deck.artifact}
                  sx={{ textTransform: "none" }}
                >
                  {downloading ? "Preparing .pptx..." : "Download .pptx"}
                </Button>
              </div>
              {downloadError && <Alert severity="error">{downloadError}</Alert>}

              <SlideDeckPreview slides={pipelineState.deck.artifact?.slides ?? []} />

              {pipelineState.deck.status === "done" && (
                <>
                  <Divider />
                  <Typography variant="subtitle2">Regenerate one slide</Typography>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                    <TextField
                      select
                      label="Slide"
                      size="small"
                      value={regenSlideIndex}
                      onChange={(e) => setRegenSlideIndex(Number(e.target.value))}
                      style={{ minWidth: 160 }}
                    >
                      {(pipelineState.deck.artifact?.slides ?? []).map((slide, idx) => (
                        <MenuItem key={idx} value={idx}>
                          {idx + 1}. {slide.title}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="What should change?"
                      size="small"
                      fullWidth
                      value={regenInstruction}
                      onChange={(e) => setRegenInstruction(e.target.value)}
                    />
                    <Button
                      variant="outlined"
                      onClick={handleRegenSlide}
                      disabled={busy || regenInstruction.trim() === ""}
                      sx={{ textTransform: "none" }}
                    >
                      Regenerate this slide
                    </Button>
                  </div>

                  <Divider />
                  <Typography variant="subtitle2">Apply a change to the whole deck</Typography>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                    <TextField
                      label="Instruction"
                      size="small"
                      fullWidth
                      value={askInstruction}
                      onChange={(e) => setAskInstruction(e.target.value)}
                    />
                    <Button
                      variant="outlined"
                      onClick={handleApplyToDeck}
                      disabled={askBusy || askInstruction.trim() === ""}
                      sx={{ textTransform: "none" }}
                    >
                      {askBusy ? "Applying..." : "Apply"}
                    </Button>
                  </div>
                  {askOutcome && <Alert severity={askOutcome.severity}>{askOutcome.text}</Alert>}
                </>
              )}
            </div>
          )}

          {activeStage === "standard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <Button
                variant="outlined"
                onClick={() => runOneStage("standard")}
                disabled={busy || !pipelineState.deck.artifact}
                sx={{ textTransform: "none", alignSelf: "start" }}
              >
                Run standard check
              </Button>
              {!pipelineState.deck.artifact && <Alert severity="info">Generate the deck first.</Alert>}
              <ReviewFindings
                ranComplete={pipelineState.standard.status === "done"}
                items={(pipelineState.standard.artifact?.violations ?? []).map((v) => ({
                  slideIndex: v.slideIndex >= 0 ? v.slideIndex : undefined,
                  message: v.detail,
                }))}
              />
            </div>
          )}

          {(activeStage === "reviewInfoFlow" || activeStage === "reviewVisual") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <Button
                variant="outlined"
                onClick={() => runOneStage(activeStage)}
                disabled={busy || !pipelineState.deck.artifact}
                sx={{ textTransform: "none", alignSelf: "start" }}
              >
                {activeStage === "reviewInfoFlow" ? "Run info-flow review" : "Run visual review"}
              </Button>
              {!pipelineState.deck.artifact && <Alert severity="info">Generate the deck first.</Alert>}
              <ReviewFindings
                ranComplete={pipelineState[activeStage].status === "done"}
                items={(pipelineState[activeStage].artifact?.findings ?? []).map((f) => ({
                  slideIndex: f.slideIndex,
                  message: f.message,
                }))}
              />
            </div>
          )}

          {activeStage === "polish" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <Button
                variant="outlined"
                onClick={() => runOneStage("polish")}
                disabled={busy || !pipelineState.deck.artifact}
                sx={{ textTransform: "none", alignSelf: "start" }}
              >
                Run polish pass
              </Button>
              {!pipelineState.deck.artifact && <Alert severity="info">Generate the deck first.</Alert>}
              {pipelineState.polish.artifact && pipelineState.polish.artifact.changes.length === 0 && (
                <Alert severity="success" variant="outlined">
                  No mechanical changes were needed.
                </Alert>
              )}
              {pipelineState.polish.artifact && pipelineState.polish.artifact.changes.length > 0 && (
                <ul>
                  {pipelineState.polish.artifact.changes.map((change, idx) => (
                    <li key={idx}>
                      {change.slideIndex >= 0 ? `Slide ${change.slideIndex + 1}: ` : ""}
                      {change.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
