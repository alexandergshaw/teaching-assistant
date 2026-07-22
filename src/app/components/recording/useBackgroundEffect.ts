"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageSegmenter as ImageSegmenterT } from "@mediapipe/tasks-vision";

export interface UseBackgroundEffectReturn {
  bgMode: "none" | "blur" | "image";
  setBgMode: (mode: "none" | "blur" | "image") => void;
  bgStatus: "idle" | "loading" | "ready" | "failed";
  bgFileRef: React.RefObject<HTMLInputElement | null>;
  bgImageRef: React.RefObject<HTMLImageElement | null>;
  applyBackgroundEffect: (video: HTMLVideoElement, w: number, h: number) => CanvasImageSource;
  segmenterRef: React.RefObject<ImageSegmenterT | null>;
}

export function useBackgroundEffect({ source }: { source: "camera" | "screen" | "audio" }): UseBackgroundEffectReturn {
  // Background effect state
  const [bgMode, setBgMode] = useState<"none" | "blur" | "image">(() => {
    if (typeof window === "undefined") return "none";
    const saved = localStorage.getItem("ta-rec-bg");
    return saved === "blur" || saved === "image" ? saved : "none";
  });
  const [bgStatus, setBgStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const segmenterRef = useRef<ImageSegmenterT | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const bgFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const personCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const bgModeRef = useRef<"none" | "blur" | "image">("none");
  const bgStatusRef = useRef<"idle" | "loading" | "ready" | "failed">("idle");
  const applyBackgroundEffectTemp = useRef<HTMLCanvasElement | null>(null);

  // Lazy load MediaPipe background segmentation model
  useEffect(() => {
    if (bgMode === "none" || segmenterRef.current || bgStatus === "loading" || bgStatus === "failed") return;
    let cancelled = false;
    setBgStatus("loading");
    (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );
        const seg = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        if (cancelled) { seg.close(); return; }
        segmenterRef.current = seg;
        setBgStatus("ready");
      } catch (err) {
        console.error("Background model failed to load:", err);
        if (!cancelled) { setBgStatus("failed"); setBgMode("none"); }
      }
    })();
    return () => { cancelled = true; };
  }, [bgMode, bgStatus]);

  // Apply background effect to video frame; returns canvas or video to use as pipeline source
  const applyBackgroundEffect = useCallback((video: HTMLVideoElement, w: number, h: number): CanvasImageSource => {
    if (source !== "camera" || bgModeRef.current === "none" || bgStatusRef.current !== "ready" || !segmenterRef.current) return video;
    try {
      const result = segmenterRef.current.segmentForVideo(video, performance.now());
      const mask = result.confidenceMasks?.[0];
      if (!mask) { result.close?.(); return video; }
      if (!bgFrameCanvasRef.current) bgFrameCanvasRef.current = document.createElement("canvas");
      if (!personCanvasRef.current) personCanvasRef.current = document.createElement("canvas");
      const frame = bgFrameCanvasRef.current, person = personCanvasRef.current;
      if (frame.width !== w) { frame.width = w; frame.height = h; }
      if (person.width !== w) { person.width = w; person.height = h; }
      const fctx = frame.getContext("2d")!;
      const pctx = person.getContext("2d")!;
      // person cutout: alpha from confidence mask
      const conf = mask.getAsFloat32Array();
      const mw = mask.width, mh = mask.height;
      const imgData = pctx.createImageData(mw, mh);
      for (let i = 0; i < conf.length; i++) imgData.data[i * 4 + 3] = Math.round(conf[i] * 255);
      // draw alpha mask at mask resolution onto person canvas scaled to w x h
      if (!applyBackgroundEffectTemp.current) applyBackgroundEffectTemp.current = document.createElement("canvas");
      const tmp = applyBackgroundEffectTemp.current;
      if (tmp.width !== mw) { tmp.width = mw; tmp.height = mh; }
      tmp.getContext("2d")!.putImageData(imgData, 0, 0);
      pctx.clearRect(0, 0, w, h);
      pctx.drawImage(tmp, 0, 0, w, h);
      pctx.globalCompositeOperation = "source-in";
      pctx.drawImage(video, 0, 0, w, h);
      pctx.globalCompositeOperation = "source-over";
      // background layer
      fctx.clearRect(0, 0, w, h);
      if (bgModeRef.current === "image" && bgImageRef.current) {
        // cover-fit the image
        const img = bgImageRef.current;
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        fctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else {
        fctx.filter = "blur(16px)";
        fctx.drawImage(video, 0, 0, w, h);
        fctx.filter = "none";
      }
      fctx.drawImage(person, 0, 0, w, h);
      (mask as unknown as { close?: () => void }).close?.();
      result.close?.();
      return frame;
    } catch (err) {
      console.error("Background effect frame failed:", err);
      return video;
    }
  }, [source]);

  // Mirror bgMode and bgStatus into refs to avoid restarting pipeline
  useEffect(() => {
    bgModeRef.current = bgMode;
  }, [bgMode]);

  useEffect(() => {
    bgStatusRef.current = bgStatus;
  }, [bgStatus]);

  return {
    bgMode,
    setBgMode,
    bgStatus,
    bgFileRef,
    bgImageRef,
    applyBackgroundEffect,
    segmenterRef,
  };
}
