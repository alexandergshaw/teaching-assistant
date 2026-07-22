"use client";

import { useEffect, useRef, useState } from "react";
import TabShell from "./TabShell";
import CaptionStudio from "./CaptionStudio";
import SlideStudio from "./SlideStudio";
import styles from "../page.module.css";
import { useSupabase } from "@/context/SupabaseProvider";
import { useRecordingSettings } from "./recording/useRecordingSettings";
import { useDevices } from "./recording/useDevices";
import { useAnnotations } from "./recording/useAnnotations";
import { useBackgroundEffect } from "./recording/useBackgroundEffect";
import { usePipWebcam } from "./recording/usePipWebcam";
import { useTitleCards } from "./recording/useTitleCards";
import { useLectureScript } from "./recording/useLectureScript";
import { useTakes } from "./recording/useTakes";
import { useCanvasPipeline } from "./recording/useCanvasPipeline";
import { useRecorder } from "./recording/useRecorder";
import SourceDevicesPanel from "./recording/SourceDevicesPanel";
import LectureScriptPanel from "./recording/LectureScriptPanel";
import StagePanel from "./recording/StagePanel";
import TakesPanel from "./recording/TakesPanel";

export type { Take } from "./recording/types";

export default function RecordingTab({ active = true }: { active?: boolean }) {
  const { supabase, user } = useSupabase();

  const [recView, setRecView] = useState<"record" | "captions" | "slides">(() => {
    if (typeof window === "undefined") return "record";
    const v = localStorage.getItem("ta-rec-view");
    return v === "captions" || v === "slides" ? v : "record";
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-rec-view", recView);
  }, [recView]);

  const [error, setError] = useState<string | null>(null);
  const [hasStream, setHasStream] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  const settings = useRecordingSettings();
  const dev = useDevices({ setError });
  const ann = useAnnotations();
  const bg = useBackgroundEffect({ source: settings.source });
  const pip = usePipWebcam({ source: settings.source, hasStream, cameraId: settings.cameraId, setError });
  const cards = useTitleCards();
  const script = useLectureScript();
  const takes = useTakes({ supabase, user, setError });

  const pipeline = useCanvasPipeline({
    videoRef,
    source: settings.source,
    mirror: settings.mirror,
    applyBackgroundEffect: bg.applyBackgroundEffect,
    overlayCanvasRef: ann.overlayCanvasRef,
    strokesRef: ann.strokesRef,
    redrawOverlay: ann.redrawOverlay,
    sourceRef: settings.sourceRef,
    pipVideoRef: pip.pipVideoRef,
    pipEnabledRef: pip.pipEnabledRef,
    pipCornerRef: pip.pipCornerRef,
    cardPhaseRef: cards.cardPhaseRef,
    cardTitleRef: cards.cardTitleRef,
    cardSubtitleRef: cards.cardSubtitleRef,
    cardClosingRef: cards.cardClosingRef,
    cardBgRef: cards.cardBgRef,
    cardTextRef: cards.cardTextRef,
  });

  const rec = useRecorder({
    active,
    settings,
    setError,
    hasStream,
    setHasStream,
    loadDevices: dev.loadDevices,
    videoRef,
    pipeline,
    cardPhaseRef: cards.cardPhaseRef,
    cardNoticeTimerRef: cards.cardNoticeTimerRef,
    setCardNotice: cards.setCardNotice,
    cardsOn: cards.cardsOn,
    cardSecondsRef: cards.cardSecondsRef,
    pipStreamRef: pip.pipStreamRef,
    pipVideoRef: pip.pipVideoRef,
    takesLength: takes.takes.length,
    addRecordedTake: takes.addRecordedTake,
  });

  // Persist form control states to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-source", settings.source);
    localStorage.setItem("ta-rec-noise", settings.noiseSuppression ? "1" : "0");
    localStorage.setItem("ta-rec-echo", settings.echoCancellation ? "1" : "0");
    localStorage.setItem("ta-rec-gain", settings.autoGain ? "1" : "0");
    localStorage.setItem("ta-rec-use-countdown", settings.useCountdown ? "1" : "0");
    localStorage.setItem("ta-rec-bg", bg.bgMode);
    localStorage.setItem("ta-rec-pip", pip.pipEnabled ? "1" : "0");
    localStorage.setItem("ta-rec-pip-corner", pip.pipCorner);
    localStorage.setItem("ta-rec-pen-color", ann.penColor);
    localStorage.setItem("ta-rec-pen-size", String(ann.penSize));
    localStorage.setItem("ta-rec-prompter", script.prompterOn ? "1" : "0");
    localStorage.setItem("ta-rec-prompter-size", script.prompterSize);
  }, [settings.source, settings.noiseSuppression, settings.echoCancellation, settings.autoGain, settings.useCountdown, bg.bgMode, pip.pipEnabled, pip.pipCorner, ann.penColor, ann.penSize, script.prompterOn, script.prompterSize]);

  // Unmount-only cleanup. Latest takes/stopEverything are read through refs so
  // this never re-runs (a deps-based cleanup would kill the stream and revoke
  // take URLs every time a take is added).
  useEffect(() => {
    return () => {
      void rec.stopEverythingRef.current();
      takes.takesRef.current.forEach((take) => {
        URL.revokeObjectURL(take.url);
      });
      bg.segmenterRef.current?.close();
    };
  }, [rec.stopEverythingRef, takes.takesRef, bg.segmenterRef]);

  return (
    <TabShell
      eyebrow="Recording"
      title="Record from a camera"
      subtitle="Record video from any attached camera or your screen, preview it live, and download the takes."
    >
      <div className={styles.lessonInnerTabs} role="tablist" aria-label="Recording tools">
        {([["record", "Record"], ["captions", "Caption a video"], ["slides", "Narrate a deck"]] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={recView === key}
            className={`${styles.lessonInnerTab}${recView === key ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setRecView(key)}>
            <span className={styles.tabLabelWrap}>{label}</span>
          </button>
        ))}
      </div>

      <div style={{ display: recView === "record" ? undefined : "none" }}>
        {error && <p className={styles.error}>{error}</p>}
        <SourceDevicesPanel
          devices={dev.devices}
          requestAccess={dev.requestAccess}
          settings={settings}
          bg={bg}
          pip={pip}
          cards={cards}
          backupDir={takes.backupDir}
          setBackupDir={takes.setBackupDir}
          userPickedRef={settings.userPickedRef}
          bgImageRef={bg.bgImageRef}
          bgFileRef={bg.bgFileRef}
        />
        <LectureScriptPanel
          scriptTopic={script.scriptTopic}
          setScriptTopic={script.setScriptTopic}
          scriptObjectives={script.scriptObjectives}
          setScriptObjectives={script.setScriptObjectives}
          scriptMinutes={script.scriptMinutes}
          setScriptMinutes={script.setScriptMinutes}
          script={script.script}
          setScript={script.setScript}
          scriptBusy={script.scriptBusy}
          setScriptBusy={script.setScriptBusy}
          scriptError={script.scriptError}
          setScriptError={script.setScriptError}
          prompterOn={script.prompterOn}
          setPrompterOn={script.setPrompterOn}
          prompterSize={script.prompterSize}
          setPrompterSize={script.setPrompterSize}
          handleGenerateScript={script.handleGenerateScript}
        />
        <StagePanel
          videoRef={videoRef}
          source={settings.source}
          mirror={settings.mirror}
          hasStream={hasStream}
          hasAudio={rec.hasAudio}
          script={script.script}
          prompterOn={script.prompterOn}
          prompterSize={script.prompterSize}
          annotations={ann}
          recState={rec.recState}
          elapsed={rec.elapsed}
          bytes={rec.bytes}
          muted={rec.muted}
          level={rec.level}
          countdown={rec.countdown}
          finishing={rec.finishing}
          toggleMute={rec.toggleMute}
          beginRecording={rec.beginRecording}
          pauseRecording={rec.pauseRecording}
          resumeRecording={rec.resumeRecording}
          stopRecording={rec.stopRecording}
          startPreview={rec.startPreview}
          stopEverything={rec.stopEverything}
          cardNotice={cards.cardNotice}
          autoStopMin={settings.autoStopMin}
          userPickedRef={settings.userPickedRef}
        />
        <TakesPanel
          takes={takes.takes}
          takeNameDrafts={takes.takeNameDrafts}
          setTakeNameDrafts={takes.setTakeNameDrafts}
          saveTakeName={takes.saveTakeName}
          handleDownload={takes.handleDownload}
          handleDelete={takes.handleDelete}
          handleExtractAudio={takes.handleExtractAudio}
          extractingAudioId={takes.extractingAudioId}
        />
      </div>

      {/* Inner views stay mounted (hidden with display:none) so navigation never kills a live preview, takes, or an in-progress caption burn. */}
      <div style={{ display: recView === "captions" ? undefined : "none" }}>
        <CaptionStudio takes={takes.takes} backupDir={takes.backupDir} />
      </div>

      <div style={{ display: recView === "slides" ? undefined : "none" }}>
        <SlideStudio />
      </div>
    </TabShell>
  );
}
