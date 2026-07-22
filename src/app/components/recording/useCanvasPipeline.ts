"use client";

import { useCallback, useRef } from "react";
import type { FrameTicker } from "@/lib/frame-ticker";
import { startFrameTicker } from "@/lib/frame-ticker";
import type { Stroke } from "./types";

export interface UseCanvasPipelineReturn {
  pipelineCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  initPipelineCanvas: () => void;
  sizeCanvases: (w: number, h: number) => void;
  startPipeline: () => void;
  stopPipeline: () => void;
}

export function useCanvasPipeline({
  videoRef,
  source,
  mirror,
  applyBackgroundEffect,
  overlayCanvasRef,
  strokesRef,
  redrawOverlay,
  sourceRef,
  pipVideoRef,
  pipEnabledRef,
  pipCornerRef,
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
  sourceRef: React.MutableRefObject<"camera" | "screen" | "audio">;
  pipVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
  pipEnabledRef: React.MutableRefObject<boolean>;
  pipCornerRef: React.MutableRefObject<"br" | "bl" | "tr" | "tl">;
  cardPhaseRef: React.MutableRefObject<"title" | "closing" | null>;
  cardTitleRef: React.MutableRefObject<string>;
  cardSubtitleRef: React.MutableRefObject<string>;
  cardClosingRef: React.MutableRefObject<string>;
  cardBgRef: React.MutableRefObject<string>;
  cardTextRef: React.MutableRefObject<string>;
}): UseCanvasPipelineReturn {
  const pipelineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipelineTickerRef = useRef<FrameTicker | null>(null);

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
  }, []);

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

      // Picture-in-Picture bubble
      const pipV = pipVideoRef.current;
      if (pipEnabledRef.current && pipV && pipV.readyState >= 2 && sourceRef.current === "screen") {
        const bw = Math.round(canvas.width * 0.22);
        const bh = Math.round(bw * (pipV.videoHeight / Math.max(1, pipV.videoWidth))) || Math.round(bw * 0.75);
        const m = Math.round(canvas.width * 0.02);

        let x = 0, y = 0;
        const corner = pipCornerRef.current;
        if (corner === "br") {
          x = canvas.width - bw - m;
          y = canvas.height - bh - m;
        } else if (corner === "bl") {
          x = m;
          y = canvas.height - bh - m;
        } else if (corner === "tr") {
          x = canvas.width - bw - m;
          y = m;
        } else if (corner === "tl") {
          x = m;
          y = m;
        }

        ctx.save();
        ctx.beginPath();
        const ctxWithRoundRect = ctx as CanvasRenderingContext2D & {
          roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
        };
        if (ctxWithRoundRect.roundRect) {
          ctxWithRoundRect.roundRect(x, y, bw, bh, 16);
        } else {
          // Fallback for older browsers
          ctx.rect(x, y, bw, bh);
        }
        ctx.clip();
        ctx.drawImage(pipV, x, y, bw, bh);
        ctx.restore();

        // Subtle white border
        ctx.save();
        ctx.beginPath();
        if (ctxWithRoundRect.roundRect) {
          ctxWithRoundRect.roundRect(x, y, bw, bh, 16);
        } else {
          ctx.rect(x, y, bw, bh);
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.stroke();
        ctx.restore();
      }

      const overlay = overlayCanvasRef.current;
      if (overlay) {
        ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
      }
    };
    pipelineTickerRef.current?.stop();
    pipelineTickerRef.current = startFrameTicker(30, draw);
  }, [source, mirror, applyBackgroundEffect, videoRef, overlayCanvasRef, cardPhaseRef, cardTitleRef, cardSubtitleRef, cardClosingRef, cardBgRef, cardTextRef, pipVideoRef, pipEnabledRef, pipCornerRef, sourceRef]);

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
  };
}
