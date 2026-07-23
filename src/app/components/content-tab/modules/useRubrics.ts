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

export function useRubrics(courseUrl: string, acronym: string | undefined): UseRubricsReturn {
  const [rubrics, setRubrics] = useState<CanvasRubric[]>([]);
  // Top-toolbar rubric picker for editing a rubric without selecting items.
  const [editRubricId, setEditRubricId] = useState<number | "">("");
  // The rubric builder's target assignments (null when closed).
  const [rubricBuilder, setRubricBuilder] = useState<RubricBuilderTarget | null>(null);

  // Reload the course's rubrics (after building a new one, so the picker shows it).
  const refreshRubrics = async () => {
    const result = await listRubricsAction(courseUrl, acronym);
    if (!("error" in result)) setRubrics(result.rubrics);
  };

  // Load the course's rubrics once for the bulk rubric-association control.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listRubricsAction(courseUrl, acronym);
      if (cancelled || "error" in result) return;
      setRubrics(result.rubrics);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym]);

  return { rubrics, refreshRubrics, editRubricId, setEditRubricId, rubricBuilder, setRubricBuilder };
}
