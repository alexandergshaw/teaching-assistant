import type { ComponentType } from "react";
import type {
  AssignmentData,
  ExamplesData,
  GenerateLessonPlanResult,
  ModuleIntroData,
} from "../../actions";

export type PreviewTab = "intro" | "slides" | "assignment" | "rubric" | "examples";

export type LessonPlanPreviewIcons = {
  CopyIcon: ComponentType;
  LockClosedIcon: ComponentType;
  LockOpenIcon: ComponentType;
  PencilIcon: ComponentType;
};

export type LessonPlanPreviewProps = {
  lessonPlanPreview: GenerateLessonPlanResult;
  assignmentPreview: AssignmentData | null;
  introPreview: ModuleIntroData | null;
  rubricPreview: string | null;
  examplesPreview: ExamplesData | null;
  copiedKey: string | null;
  onClose: () => void;
  onCopy: (copyKey: string, value: string) => Promise<void>;
  onSaveField: (key: string, draft: string) => void;
  onRegenerate: (revisionPrompt: string) => Promise<boolean>;
  onDownload: () => Promise<void>;
  attachCourses?: Array<{ id: string; name: string }> | null;
  attachBusy?: boolean;
  attachNote?: { kind: "success" | "error"; text: string } | null;
  onAttach?: (courseId: string) => void;
  icons: LessonPlanPreviewIcons;
};
