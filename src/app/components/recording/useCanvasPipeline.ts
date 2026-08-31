"use client";

import { useCallback, useRef } from "react";
import type { FrameTicker } from "@/lib/frame-ticker";
import { startFrameTicker } from "@/lib/frame-ticker";
import type { Stroke } from "./types";
import { BUBBLE_SIZE_FRACTIONS } from "./bubble-geometry";
import { drawWebcamBubble } from "./bubble-draw";

export interface UseCanvasPipelineReturn {
  pipelineCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  initPipelineCanvas: () => void;
  sizeCanvases: (w: number, h: number) => void;
  startPipeline: () => void;
  stopPipeline: () => void;
  // AC14: mounts (or unmounts, on null) the pipeline canvas into a live DOM
  // host so the composited output - including the bubble - is visible before
  // recording starts, not only in the recorded file. Only sets CSS size, per
  // trap: sizeCanvases alone owns the canvas's width/height (drawing-buffer)
  // attributes, which captureStream follows.
  attachPipelineCanvas: (host: HTMLElement | null) => void;
}

export function useCanvasPipeline({
  videoRef,
  source,
  mirror,
  applyBackgroundEffect,
  overlayCanvasRef,
  strokesRef,
  redrawOverlay,
  pipVideoRef,
  pipEnabledRef,
  pipCornerRef,
  bubbleShapeRef,
  bubbleSizeRef,
  cardPhaseRef,
  cardTitleRef,
  cardSubtitleRef,
  cardClosingRef,
  cardBgRef,
  cardTextRef,
}: {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  source: "camera" | "screen" | "audio";
  mirror: boolean;
  applyBackgroundEffect: (video: HTMLVideoElement, w: number, h: number) => CanvasImageSource;
  overlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  strokesRef: React.MutableRefObject<Stroke[]>;
  redrawOverlay: () => void;
  pipVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
  // Redefined: "the bubble is live and should be drawn", not "the checkbox is
  // ticked". The old draw-time `sourceRef.current === "screen"` gate is gone -
  // usePipWebcam folds that condition (via its `active` prop) into this ref.
  pipEnabledRef: React.MutableRefObject<boolean>;
  pipCornerRef: React.MutableRefObject<"br" | "bl" | "tr" | "tl">;
  bubbleShapeRef: React.MutableRefObject<"circle" | "rounded">;
  bubbleSizeRef: React.MutableRefObject<"sm" | "md" | "lg">;
  cardPhaseRef: React.MutableRefObject<"title" | "closing" | null>;
  cardTitleRef: React.MutableRefObject<string>;
  cardSubtitleRef: React.MutableRefObject<string>;
  cardClosingRef: React.MutableRefObject<string>;
  cardBgRef: React.MutableRefObject<string>;
  cardTextRef: React.MutableRefObject<string>;
}): UseCanvasPipelineReturn {
  const pipelineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipelineTickerRef = useRef<FrameTicker | null>(null);
  const pipelineHostRef = useRef<HTMLElement | null>(null);

  const attachCanvasToHost = useCallback(() => {
    const canvas = pipelineCanvasRef.current;
    const host = pipelineHostRef.current;
    if (!canvas || !host) return;
    if (canvas.parentElement !== host) {
      canvas.style.width = "100%";
      canvas.style.maxHeight = "48vh";
      canvas.style.objectFit = "contain";
      canvas.style.background = "#0f172a";
      canvas.style.display = "block";
      host.appendChild(canvas);
    }
  }, []);

  const attachPipelineCanvas = useCallback((host: HTMLElement | null) => {
    pipelineHostRef.current = host;
    attachCanvasToHost();
  }, [attachCanvasToHost]);

  const sizeCanvases = useCallback((w: number, h: number) => {
    if (pipelineCanvasRef.current) {
      pipelineCanvasRef.current.width = w;
      pipelineCanvasRef.current.height = h;
    }
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = w;
      overlayCanvasRef.current.height = h;
    }
    strokesRef.current = [];
    redrawOverlay();
  }, [redrawOverlay, overlayCanvasRef, strokesRef]);

  const initPipelineCanvas = useCallback(() => {
    if (!pipelineCanvasRef.current) {
      pipelineCanvasRef.current = document.createElement("canvas");
    }
    attachCanvasToHost();
  }, [attachCanvasToHost]);

  const startPipeline = useCallback(() => {
    const canvas = pipelineCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Feature 3: Draw title or closing card instead of normal content
      if (cardPhaseRef.current) {
        ctx.fillStyle = cardBgRef.current;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = cardTextRef.current;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (cardPhaseRef.current === "title") {
          ctx.font = `700 ${Math.round(canvas.height * 0.08)}px system-ui, sans-serif`;
          ctx.fillText(cardTitleRef.current || "Lecture", canvas.width / 2, canvas.height * 0.45);
          if (cardSubtitleRef.current) {
            ctx.font = `400 ${Math.round(canvas.height * 0.045)}px system-ui, sans-serif`;
            ctx.globalAlpha = 0.8;
            ctx.fillText(cardSubtitleRef.current, canvas.width / 2, canvas.height * 0.58);
            ctx.globalAlpha = 1;
          }
        } else if (cardPhaseRef.current === "closing") {
          ctx.font = `700 ${Math.round(canvas.height * 0.08)}px system-ui, sans-serif`;
          ctx.fillText(cardClosingRef.current, canvas.width / 2, canvas.height * 0.5);
        }
        return;
      }
      const src = applyBackgroundEffect(video, canvas.width, canvas.height);
      if (source === "camera" && mirror) {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      }

      // Loom-style webcam bubble (AC7-AC14). pipEnabledRef is "should the
      // bubble be drawn right now" - usePipWebcam already folds in whether
      // the checkbox is on, whether this surface is active, and whether the
      // stream was actually acquired. Always mirrored (Loom's behaviour,
      // AC13) - no user control for it.
      const pipV = pipVideoRef.current;
      if (pipEnabledRef.current && pipV) {
        drawWebcamBubble(ctx, pipV, canvas.width, canvas.height, {
          shape: bubbleShapeRef.current,
          corner: pipCornerRef.current,
          sizeFraction: BUBBLE_SIZE_FRACTIONS[bubbleSizeRef.current],
          mirror: true,
        });
      }

      const overlay = overlayCanvasRef.current;
      if (overlay) {
        ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
      }
    };
    pipelineTickerRef.current?.stop();
    pipelineTickerRef.current = startFrameTicker(30, draw);
  }, [source, mirror, applyBackgroundEffect, videoRef, overlayCanvasRef, cardPhaseRef, cardTitleRef, cardSubtitleRef, cardClosingRef, cardBgRef, cardTextRef, pipVideoRef, pipEnabledRef, pipCornerRef, bubbleShapeRef, bubbleSizeRef]);

  const stopPipeline = useCallback(() => {
    pipelineTickerRef.current?.stop();
    pipelineTickerRef.current = null;
  }, []);

  return {
    pipelineCanvasRef,
    initPipelineCanvas,
    sizeCanvases,
    startPipeline,
    stopPipeline,
    attachPipelineCanvas,
  };
}
