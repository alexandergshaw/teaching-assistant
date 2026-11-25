import { createCapturePicker } from "../recording/capture-picker";
import { videoExtensionFromMimeType } from "../recording/discussion-capture";
import { requestScreenShareStream, SCREEN_AUDIO_NOT_GRANTED_NOTICE } from "../recording/screen-source";

export type ScreenCaptureState = {
  phase: "idle" | "opening" | "recording" | "finishing";
  error?: string;
  notice?: string;
};

type CaptureSession = { dispose?: () => void; finish?: () => void };

export function createLectureScreenCapture({
  onState,
  onCapturingChange,
  onCaptured,
}: {
  onState: (state: ScreenCaptureState) => void;
  onCapturingChange: (capturing: boolean) => void;
  onCaptured: (file: File, hasSystemAudio: boolean) => void;
}) {
  const picker = createCapturePicker();
  let session: CaptureSession | null = null;

  function clear(current: CaptureSession, error?: string) {
    if (session !== current) return false;
    session = null;
    picker.cancel();
    current.dispose?.();
    onState({ phase: "idle", error });
    onCapturingChange(false);
    return true;
  }

  async function start(shareSystemAudio: boolean) {
    if (session) return;
    if (typeof MediaRecorder === "undefined" || typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      onState({ phase: "idle", error: "Screen recording is unavailable in this browser. You can still add a video file." });
      return;
    }

    const current: CaptureSession = {};
    session = current;
    onState({ phase: "opening" });
    onCapturingChange(true);
    try {
      const stream = await picker.request(
        () => requestScreenShareStream(shareSystemAudio),
        (selected) => { current.dispose = () => selected.getTracks().forEach((track) => track.stop()); },
      );
      if (!stream || session !== current) return;
      const video = stream.getVideoTracks().find((track) => track.readyState === "live");
      if (!video) {
        clear(current, "No shared screen was available to record.");
        return;
      }
      if (!shareSystemAudio) {
        for (const track of stream.getAudioTracks()) {
          stream.removeTrack(track);
          track.stop();
        }
      }
      const hasSystemAudio = shareSystemAudio && stream.getAudioTracks().some((track) => track.readyState === "live");
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      let finishTimer: ReturnType<typeof setTimeout> | undefined;
      const stopTracks = current.dispose;
      const finish = () => {
        if (session !== current || finishTimer !== undefined) return;
        onState({ phase: "finishing" });
        finishTimer = setTimeout(() => clear(current, "The browser did not finish the screen recording."), 10000);
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          clear(current, "The browser could not finish the screen recording.");
        }
      };

      current.finish = finish;
      current.dispose = () => {
        clearTimeout(finishTimer);
        video.removeEventListener("ended", finish);
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          // A browser shutdown can make stop throw even after the state check.
        } finally {
          stopTracks?.();
          chunks.length = 0;
        }
      };
      recorder.ondataavailable = ({ data }) => {
        if (session === current && data.size) chunks.push(data);
      };
      recorder.onerror = () => clear(current, "The browser stopped recording before the video could be saved.");
      recorder.onstop = () => {
        if (session !== current) return;
        if (!chunks.length) {
          clear(current, "No video was recorded. Share a screen and try again.");
          return;
        }
        const type = recorder.mimeType || chunks[0].type || "video/webm";
        const stamp = new Date().toISOString().slice(0, 19).replace("T", " ").replaceAll(":", "-");
        const file = new File(chunks, `Screen recording ${stamp}.${videoExtensionFromMimeType(type)}`, { type });
        if (clear(current)) onCaptured(file, hasSystemAudio);
      };
      video.addEventListener("ended", finish, { once: true });
      recorder.start(1000);
      onState({
        phase: "recording",
        notice: shareSystemAudio && !hasSystemAudio ? SCREEN_AUDIO_NOT_GRANTED_NOTICE : undefined,
      });
    } catch (error) {
      const pickerClosed = error instanceof DOMException && error.name === "NotAllowedError";
      clear(current, pickerClosed ? "Screen sharing was canceled or blocked." : "Unable to start screen recording.");
    }
  }

  return {
    start,
    stop() { session?.finish?.(); },
    cancel() { if (session) clear(session); },
    leaveView() { if (session && !session.finish) clear(session); },
  };
}
