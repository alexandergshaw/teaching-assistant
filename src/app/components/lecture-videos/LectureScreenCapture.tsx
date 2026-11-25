"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, FormControlLabel, Stack, Typography } from "@mui/material";
import { createLectureScreenCapture, type ScreenCaptureState } from "./lecture-screen-capture";

type Props = {
  active: boolean;
  disabled?: boolean;
  onCapturingChange?: (capturing: boolean) => void;
  onCaptured: (file: File, hasSystemAudio: boolean) => void;
};

export default function LectureScreenCapture({ active, disabled, onCapturingChange, onCaptured }: Props) {
  const [shareSystemAudio, setShareSystemAudio] = useState(false);
  const [state, setState] = useState<ScreenCaptureState>({ phase: "idle" });
  const callbacks = useRef({ onCapturingChange, onCaptured });
  const capture = useRef<ReturnType<typeof createLectureScreenCapture> | null>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const lastPhase = useRef(state.phase);
  useLayoutEffect(() => { callbacks.current = { onCapturingChange, onCaptured }; }, [onCapturingChange, onCaptured]);
  useLayoutEffect(() => () => capture.current?.cancel(), []);
  useLayoutEffect(() => {
    if (!active) capture.current?.leaveView();
  }, [active]);
  useLayoutEffect(() => {
    if (active && state.phase !== lastPhase.current) {
      const target = state.phase === "recording" ? stopButton
        : state.phase === "idle" ? startButton : cancelButton;
      target.current?.focus();
    }
    lastPhase.current = state.phase;
  }, [active, state.phase]);

  function startCapture() {
    capture.current ??= createLectureScreenCapture({
      onState: setState,
      onCapturingChange: (capturing) => callbacks.current.onCapturingChange?.(capturing),
      onCaptured: (file, hasSystemAudio) => callbacks.current.onCaptured(file, hasSystemAudio),
    });
    void capture.current.start(shareSystemAudio);
  }

  const capturing = state.phase !== "idle";
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        {capturing ? (
          <>
            <Button ref={stopButton} variant="contained" disabled={state.phase !== "recording"} onClick={() => capture.current?.stop()}>
              Stop and add recording
            </Button>
            <Button ref={cancelButton} onClick={() => capture.current?.cancel()}>Cancel recording</Button>
          </>
        ) : (
          <>
            <Button ref={startButton} variant="outlined" disabled={!active || disabled} onClick={startCapture}>
              Record screen
            </Button>
            <FormControlLabel
              label="Include shared screen audio"
              control={<Checkbox checked={shareSystemAudio} disabled={!active || disabled}
                onChange={(_, checked) => setShareSystemAudio(checked)} />}
            />
          </>
        )}
      </Stack>
      {capturing && <Typography variant="body2" role="status">
        {state.phase === "opening" ? "Choose a screen, window, or tab to share."
          : state.phase === "recording" ? "Recording your shared screen." : "Finishing the recording."}
      </Typography>}
      {state.notice && <Alert severity="info">{state.notice}</Alert>}
      {state.error && <Alert severity="warning">{state.error}</Alert>}
    </Stack>
  );
}
