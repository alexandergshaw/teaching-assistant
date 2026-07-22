"use client";

import { useCallback, useRef, useState } from "react";
import type { Stroke } from "./types";

export interface UseAnnotationsReturn {
  overlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  strokesRef: React.MutableRefObject<Stroke[]>;
  drawingRef: React.MutableRefObject<boolean>;
  tool: "off" | "pen" | "highlighter" | "eraser";
  setTool: (tool: "off" | "pen" | "highlighter" | "eraser") => void;
  penColor: string;
  setPenColor: (color: string) => void;
  penSize: number;
  setPenSize: (size: number) => void;
  redrawOverlay: () => void;
  overlayPoint: (e: React.PointerEvent<HTMLCanvasElement>) => { x: number; y: number };
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: () => void;
  handleUndo: () => void;
  handleClear: () => void;
}

export function useAnnotations(): UseAnnotationsReturn {
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);

  // Annotation state
  const [tool, setTool] = useState<"off" | "pen" | "highlighter" | "eraser">("off");
  const [penColor, setPenColor] = useState<string>(() => {
    if (typeof window === "undefined") return "#ef4444";
    return localStorage.getItem("ta-rec-pen-color") ?? "#ef4444";
  });
  const [penSize, setPenSize] = useState<number>(() => {
    if (typeof window === "undefined") return 4;
    const saved = localStorage.getItem("ta-rec-pen-size");
    const n = saved ? Number(saved) : NaN;
    return isNaN(n) ? 4 : n;
  });

  const redrawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = stroke.size * 4;
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else if (stroke.tool === "pen") {
        ctx.globalCompositeOperation = "source-over";
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
      } else if (stroke.tool === "highlighter") {
        ctx.globalCompositeOperation = "source-over";
        ctx.lineWidth = stroke.size * 4;
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 0.35;
      }

      if (stroke.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }

      ctx.restore();
    }
  }, []);

  const overlayPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = overlayCanvasRef.current!;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * c.width;
    const y = ((e.clientY - r.top) / r.height) * c.height;
    // The overlay canvas is not CSS-mirrored, so pointer coords map 1:1 even
    // when the video preview is mirrored (the pipeline mirrors the video too).
    return { x, y };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "off") return;
    const c = overlayCanvasRef.current!;
    c.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const point = overlayPoint(e);
    strokesRef.current.push({
      tool: tool as "pen" | "highlighter" | "eraser",
      color: penColor,
      size: penSize,
      points: [point],
    });
    redrawOverlay();
  }, [tool, penColor, penSize, overlayPoint, redrawOverlay]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const lastStroke = strokesRef.current[strokesRef.current.length - 1];
    if (lastStroke) {
      lastStroke.points.push(overlayPoint(e));
      redrawOverlay();
    }
  }, [overlayPoint, redrawOverlay]);

  const handlePointerUp = useCallback(() => {
    drawingRef.current = false;
  }, []);

  const handleUndo = useCallback(() => {
    strokesRef.current.pop();
    redrawOverlay();
  }, [redrawOverlay]);

  const handleClear = useCallback(() => {
    strokesRef.current = [];
    redrawOverlay();
  }, [redrawOverlay]);

  return {
    overlayCanvasRef,
    strokesRef,
    drawingRef,
    tool,
    setTool,
    penColor,
    setPenColor,
    penSize,
    setPenSize,
    redrawOverlay,
    overlayPoint,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleClear,
  };
}
