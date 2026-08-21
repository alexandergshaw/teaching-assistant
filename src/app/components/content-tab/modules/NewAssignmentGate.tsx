"use client";

import type { CanvasModule } from "@/lib/canvas-modules";
import styles from "../../../page.module.css";
import { gateOperation, type ContentSourceContext } from "../contentSourceGating";
import { NewAssignmentPanel } from "./NewAssignmentPanel";
import type { UseNewAssignmentFormReturn } from "./useNewAssignmentForm";

export interface NewAssignmentGateProps {
  ctx: ContentSourceContext;
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  busy: boolean;
  newAssignmentForm: UseNewAssignmentFormReturn;
}

/**
 * Gated as ONE unit, the same way AddItemRow is (entry 264 check 8). Every
 * control in this panel - "Add module", the "New assignment" toggle and the
 * whole form behind it - ends in a Canvas write keyed on a live courseUrl,
 * so there is no half of it worth offering against a stored export. Its own
 * guards are only `busy || !newModuleName.trim()`, which stay TRUE for an
 * export selection, so without this the buttons would be clickable and fail
 * with a raw technical error instead of the gating table's wording. Found
 * once EXPORT_COURSES_SELECTABLE flipped; before that this panel was
 * unreachable in export mode.
 *
 * Extracted structurally out of ModulesView.tsx (which was over this repo's
 * 1000-line ceiling) - no behaviour changed, only moved.
 */
export function NewAssignmentGate({ ctx, courseUrl, acronym, modules, busy, newAssignmentForm }: NewAssignmentGateProps) {
  const panelGate = gateOperation(ctx, "courseWrite");
  if (!panelGate.allowed) {
    return <p className={styles.fieldHint}>{panelGate.reason}</p>;
  }
  return (
    <NewAssignmentPanel
      courseUrl={courseUrl}
      acronym={acronym}
      modules={modules}
      busy={busy}
      newModuleName={newAssignmentForm.newModuleName}
      setNewModuleName={newAssignmentForm.setNewModuleName}
      handleAddModule={newAssignmentForm.handleAddModule}
      showNewAssignment={newAssignmentForm.showNewAssignment}
      setShowNewAssignment={newAssignmentForm.setShowNewAssignment}
      naName={newAssignmentForm.naName}
      setNaName={newAssignmentForm.setNaName}
      naPoints={newAssignmentForm.naPoints}
      setNaPoints={newAssignmentForm.setNaPoints}
      naGrading={newAssignmentForm.naGrading}
      setNaGrading={newAssignmentForm.setNaGrading}
      naDue={newAssignmentForm.naDue}
      setNaDue={newAssignmentForm.setNaDue}
      naUnlock={newAssignmentForm.naUnlock}
      setNaUnlock={newAssignmentForm.setNaUnlock}
      naLock={newAssignmentForm.naLock}
      setNaLock={newAssignmentForm.setNaLock}
      naAttempts={newAssignmentForm.naAttempts}
      setNaAttempts={newAssignmentForm.setNaAttempts}
      naType={newAssignmentForm.naType}
      setNaType={newAssignmentForm.setNaType}
      naExtensions={newAssignmentForm.naExtensions}
      setNaExtensions={newAssignmentForm.setNaExtensions}
      naModuleId={newAssignmentForm.naModuleId}
      setNaModuleId={newAssignmentForm.setNaModuleId}
      naGroupId={newAssignmentForm.naGroupId}
      setNaGroupId={newAssignmentForm.setNaGroupId}
      naGroups={newAssignmentForm.naGroups}
      setNaGroups={newAssignmentForm.setNaGroups}
      naPeer={newAssignmentForm.naPeer}
      setNaPeer={newAssignmentForm.setNaPeer}
      naOmit={newAssignmentForm.naOmit}
      setNaOmit={newAssignmentForm.setNaOmit}
      naPublish={newAssignmentForm.naPublish}
      setNaPublish={newAssignmentForm.setNaPublish}
      naDescription={newAssignmentForm.naDescription}
      setNaDescription={newAssignmentForm.setNaDescription}
      naDrafting={newAssignmentForm.naDrafting}
      handleDraftDescription={newAssignmentForm.handleDraftDescription}
      naBusy={newAssignmentForm.naBusy}
      handleCreateAssignment={newAssignmentForm.handleCreateAssignment}
    />
  );
}
