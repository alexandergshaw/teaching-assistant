"use client";

import type React from "react";
import { useEffect, useState } from "react";
import type { CanvasRubric } from "@/lib/canvas-modules";
import { listRubricsAction } from "../../../actions";

export interface RubricBuilderTarget {
  assignments: Array<{ id: string; title: string; points: number | null }>;
  editRubricId?: number;
}

export interface UseRubricsReturn {
  rubrics: CanvasRubric[];
  refreshRubrics: () => Promise<void>;
  editRubricId: number | "";
  setEditRubricId: React.Dispatch<React.SetStateAction<number | "">>;
  rubricBuilder: RubricBuilderTarget | null;
  setRubricBuilder: React.Dispatch<React.SetStateAction<RubricBuilderTarget | null>>;
}

type Note = { kind: "success" | "error"; text: string } | null;

/** What a listRubricsAction result means for the rubric picker: which list to
 * show, and whether the shared note channel should report a problem.
 *
 * Exported and unit-tested on its own (rather than only inside the effect/
 * refreshRubrics closures below) because useRubrics itself is a React hook
 * this vitest setup cannot render - see useCartridgeToCanvas.test.ts's own
 * header for why every decision a hook makes here is pulled into a plain
 * function instead.
 *
 * `error` on the success shape (rubrics.ts's listRubrics degrading rather
 * than discarding what loaded - AC4) still surfaces a note: the picker shows
 * whatever DID load, while the note names what did not, so "no rubrics" is
 * never confused with "could not load your rubrics" (AC3). The bare
 * `{ error }` shape (the action failing outright) reports the same way but
 * with an empty rubric list, since nothing loaded at all. */
export function interpretRubricsResult(
  result: { rubrics: CanvasRubric[]; error?: string } | { error: string }
): { rubrics: CanvasRubric[]; note: Note } {
  if (!("rubrics" in result)) {
    return { rubrics: [], note: { kind: "error", text: result.error } };
  }
  return {
    rubrics: result.rubrics,
    note: result.error ? { kind: "error", text: result.error } : null,
  };
}

export function useRubrics(
  courseUrl: string,
  acronym: string | undefined,
  setNote: (n: Note) => void
): UseRubricsReturn {
  const [rubrics, setRubrics] = useState<CanvasRubric[]>([]);
  // Top-toolbar rubric picker for editing a rubric without selecting items.
  const [editRubricId, setEditRubricId] = useState<number | "">("");
  // The rubric builder's target assignments (null when closed).
  const [rubricBuilder, setRubricBuilder] = useState<RubricBuilderTarget | null>(null);

  // Reload the course's rubrics (after building a new one, so the picker shows it).
  const refreshRubrics = async () => {
    const result = await listRubricsAction(courseUrl, acronym);
    const { rubrics: loaded, note } = interpretRubricsResult(result);
    setRubrics(loaded);
    if (note) setNote(note);
  };

  // Load the course's rubrics once for the bulk rubric-association control.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listRubricsAction(courseUrl, acronym);
      if (cancelled) return;
      const { rubrics: loaded, note } = interpretRubricsResult(result);
      setRubrics(loaded);
      if (note) setNote(note);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym, setNote]);

  return { rubrics, refreshRubrics, editRubricId, setEditRubricId, rubricBuilder, setRubricBuilder };
}
