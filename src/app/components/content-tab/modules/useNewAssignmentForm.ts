"use client";

import type React from "react";
import { useState } from "react";
import { getStoredProvider } from "@/lib/llm-provider";
import type { CanvasModule } from "@/lib/canvas-modules";
import { createCourseAssignmentAction, createModuleAction, draftAssignmentDescriptionAction } from "../../../actions";

export interface UseNewAssignmentFormReturn {
  newModuleName: string;
  setNewModuleName: (v: string) => void;
  handleAddModule: () => Promise<void>;
  showNewAssignment: boolean;
  setShowNewAssignment: React.Dispatch<React.SetStateAction<boolean>>;
  naName: string;
  setNaName: (v: string) => void;
  naPoints: string;
  setNaPoints: (v: string) => void;
  naDue: string;
  setNaDue: (v: string) => void;
  naType: string;
  setNaType: (v: string) => void;
  naDescription: string;
  setNaDescription: (v: string) => void;
  naPublish: boolean;
  setNaPublish: (v: boolean) => void;
  naModuleId: string;
  setNaModuleId: (v: string) => void;
  naBusy: boolean;
  naUnlock: string;
  setNaUnlock: (v: string) => void;
  naLock: string;
  setNaLock: (v: string) => void;
  naGrading: string;
  setNaGrading: (v: string) => void;
  naAttempts: string;
  setNaAttempts: (v: string) => void;
  naExtensions: string;
  setNaExtensions: (v: string) => void;
  naPeer: boolean;
  setNaPeer: (v: boolean) => void;
  naOmit: boolean;
  setNaOmit: (v: boolean) => void;
  naGroupId: string;
  setNaGroupId: (v: string) => void;
  naGroups: Array<{ id: number; name: string }> | null;
  setNaGroups: React.Dispatch<React.SetStateAction<Array<{ id: number; name: string }> | null>>;
  naDrafting: boolean;
  handleCreateAssignment: () => Promise<void>;
  handleDraftDescription: () => Promise<void>;
}

// State + handlers for the top-of-page "Add a module" field and the
// collapsible "New assignment" form (creates a course assignment directly,
// optionally linking it into a module).
export function useNewAssignmentForm(
  courseUrl: string,
  acronym: string | undefined,
  modules: CanvasModule[],
  run: (fn: () => Promise<{ error: string } | unknown>, fallbackMsg: string) => Promise<void>,
  reload: () => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void
): UseNewAssignmentFormReturn {
  const [newModuleName, setNewModuleName] = useState("");
  const [showNewAssignment, setShowNewAssignment] = useState(false);
  const [naName, setNaName] = useState("");
  const [naPoints, setNaPoints] = useState("100");
  const [naDue, setNaDue] = useState("");
  const [naType, setNaType] = useState("online_text_entry");
  const [naDescription, setNaDescription] = useState("");
  const [naPublish, setNaPublish] = useState(true);
  const [naModuleId, setNaModuleId] = useState<string>("");
  const [naBusy, setNaBusy] = useState(false);
  const [naUnlock, setNaUnlock] = useState("");
  const [naLock, setNaLock] = useState("");
  const [naGrading, setNaGrading] = useState("points");
  const [naAttempts, setNaAttempts] = useState("unlimited");
  const [naExtensions, setNaExtensions] = useState("");
  const [naPeer, setNaPeer] = useState(false);
  const [naOmit, setNaOmit] = useState(false);
  const [naGroupId, setNaGroupId] = useState("");
  const [naGroups, setNaGroups] = useState<Array<{ id: number; name: string }> | null>(null);
  const [naDrafting, setNaDrafting] = useState(false);

  const handleAddModule = async () => {
    const name = newModuleName.trim();
    if (!name) return;
    setNewModuleName("");
    await run(
      () => createModuleAction(courseUrl, name, modules.length + 1, acronym),
      "Could not create the module."
    );
    reload();
  };

  const handleCreateAssignment = async () => {
    if (!naName.trim()) return;
    setNaBusy(true);
    const r = await createCourseAssignmentAction(
      courseUrl,
      {
        name: naName,
        description: naDescription,
        pointsPossible: naPoints.trim() ? Number(naPoints) : null,
        dueAt: naDue,
        submissionType: naType,
        published: naPublish,
        unlockAt: naUnlock,
        lockAt: naLock,
        gradingType: naGrading,
        allowedAttempts: naAttempts === "unlimited" ? -1 : Number(naAttempts),
        allowedExtensions: naType === "online_upload" ? naExtensions : "",
        peerReviews: naPeer,
        omitFromFinalGrade: naOmit,
        assignmentGroupId: naGroupId ? Number(naGroupId) : null,
      },
      naModuleId ? Number(naModuleId) : null,
      acronym
    );
    setNaBusy(false);
    if ("error" in r) {
      setNote({ kind: "error", text: r.error });
      return;
    }
    setNote({ kind: "success", text: `Created "${r.name}"${r.addedToModule ? " and added it to the module" : ""}.` });
    setShowNewAssignment(false);
    setNaName("");
    setNaDescription("");
    setNaDue("");
    setNaUnlock("");
    setNaLock("");
    setNaGrading("points");
    setNaAttempts("unlimited");
    setNaExtensions("");
    setNaPeer(false);
    setNaOmit(false);
    setNaGroupId("");
    reload();
  };

  const handleDraftDescription = async () => {
    setNaDrafting(true);
    const r = await draftAssignmentDescriptionAction(naName, naDescription, getStoredProvider());
    setNaDrafting(false);
    if ("error" in r) {
      setNote({ kind: "error", text: r.error });
      return;
    }
    setNaDescription(r.text);
  };

  return {
    newModuleName, setNewModuleName, handleAddModule,
    showNewAssignment, setShowNewAssignment,
    naName, setNaName, naPoints, setNaPoints, naDue, setNaDue, naType, setNaType,
    naDescription, setNaDescription, naPublish, setNaPublish, naModuleId, setNaModuleId, naBusy,
    naUnlock, setNaUnlock, naLock, setNaLock, naGrading, setNaGrading, naAttempts, setNaAttempts,
    naExtensions, setNaExtensions, naPeer, setNaPeer, naOmit, setNaOmit, naGroupId, setNaGroupId,
    naGroups, setNaGroups, naDrafting, handleCreateAssignment, handleDraftDescription,
  };
}
