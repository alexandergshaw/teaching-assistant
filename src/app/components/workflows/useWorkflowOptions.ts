"use client";

import { useEffect, useState } from "react";
import { listCourseHubAction, listDeckTemplatesAction, listArtifactTemplatesAction, listCoursesAction, listMyOrgsAction, listCourseContentAction } from "@/app/actions";
import { writeCachedSelectorLabel } from "@/lib/course-selector-labels";
import { DECK_PRESETS } from "@/lib/decks/presets";
import { presetsForKind } from "@/lib/artifact-templates/presets";
import { liveModuleValue, exportModuleValue } from "@/lib/workflows/module-value";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { RuntimeField } from "@/lib/workflows/types";
import type { WorkflowSchedule, ScheduleRepeat } from "@/lib/workflow-schedules";
import type { TriggerEventType } from "@/lib/workflow-triggers";
import type { CartridgeCourseData } from "@/lib/cartridge-import";

export interface UseWorkflowOptionsReturn {
  hubCourses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null;
  setHubCourses: (courses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null) => void;
  hubCoursesError: string | null;
  deckTemplates: Array<{ id: string; name: string }> | null;
  deckTemplatesError: string | null;
  assignmentTemplates: Array<{ id: string; name: string }> | null;
  assignmentTemplatesError: string | null;
  testTemplates: Array<{ id: string; name: string }> | null;
  testTemplatesError: string | null;
  classSessionTemplates: Array<{ id: string; name: string }> | null;
  classSessionTemplatesError: string | null;
  lmsCourseOptions: Array<{ url: string; name: string }> | null;
  lmsCourseOptionsError: string | null;
  lmsModuleOptions: Array<{ value: string; label: string }>;
  lmsModuleError: string | null;
  lmsModuleFromExport: boolean;
  orgs: string[] | null;
  orgsError: string | null;
}

export function useWorkflowOptions(
  // True while the merged Workflows page's "Steps" disclosure is open (or
  // being edited) - mirrors the old `panel === "build"` signal that used to
  // gate eager-loading these option lists while the Build tab was active.
  buildOpen: boolean,
  runtimeFields: RuntimeField[],
  values: Record<string, string>,
  activeInstitution: string | null,
  loadCourseExportData: (courseId: string) => Promise<CartridgeCourseData | null>,
  schedules: WorkflowSchedule[] | null,
  scheduleForm: { runAt: string; repeat: ScheduleRepeat; intervalValue: string; intervalUnit: "minutes" | "hours"; courseId: string; institution: string; unattended: boolean } | null,
  triggerForm: { eventType: TriggerEventType; config: Record<string, string>; courseId: string; institution: string; unattended: boolean } | null
): UseWorkflowOptionsReturn {
  const [hubCourses, setHubCourses] = useState<Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null>(null);
  const [hubCoursesError, setHubCoursesError] = useState<string | null>(null);

  const [deckTemplates, setDeckTemplates] = useState<Array<{ id: string; name: string }> | null>(null);
  const [deckTemplatesError, setDeckTemplatesError] = useState<string | null>(null);

  const [assignmentTemplates, setAssignmentTemplates] = useState<Array<{ id: string; name: string }> | null>(null);
  const [assignmentTemplatesError, setAssignmentTemplatesError] = useState<string | null>(null);

  const [testTemplates, setTestTemplates] = useState<Array<{ id: string; name: string }> | null>(null);
  const [testTemplatesError, setTestTemplatesError] = useState<string | null>(null);

  const [classSessionTemplates, setClassSessionTemplates] = useState<Array<{ id: string; name: string }> | null>(null);
  const [classSessionTemplatesError, setClassSessionTemplatesError] = useState<string | null>(null);

  const [lmsCourseOptions, setLmsCourseOptions] = useState<Array<{ url: string; name: string }> | null>(null);
  const [lmsCourseOptionsError, setLmsCourseOptionsError] = useState<string | null>(null);

  const [lmsModuleOptions, setLmsModuleOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [lmsModuleError, setLmsModuleError] = useState<string | null>(null);
  const [lmsModuleFromExport, setLmsModuleFromExport] = useState(false);

  const [orgs, setOrgs] = useState<string[] | null>(null);
  const [orgsError, setOrgsError] = useState<string | null>(null);

  useEffect(() => {
    const needsHubCourse =
      runtimeFields.some((f) => f.type === "hubCourse" || f.type === "hubCourseList") ||
      buildOpen ||
      scheduleForm !== null ||
      triggerForm !== null ||
      (schedules ?? []).some((s) => s.courseId);
    if (!needsHubCourse || hubCourses !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await listCourseHubAction();
        if (!cancelled) {
          if ("error" in list) {
            setHubCoursesError(list.error);
          } else {
            const mapped = list.courses.map((c) => ({ id: c.id, name: c.name, canvasUrl: c.canvasUrl ?? null, repos: (c.repos || []).map((x) => x.repo) }));
            setHubCourses(mapped);
            setHubCoursesError(null);
            // The list just loaded with real names - cache all of them, not
            // just whatever a field happens to have selected right now, so
            // that RuntimeFieldInput's hubCourse MenuItem (and anything else
            // that reads this cache) has a fresh name ready for the id the
            // moment it's next restored from localStorage, on this page or
            // any other. See src/lib/course-selector-labels.ts.
            for (const course of mapped) {
              writeCachedSelectorLabel("hubCourse", course.id, course.name);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setHubCoursesError(err instanceof Error ? err.message : "Could not load courses.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, hubCourses, scheduleForm, schedules, triggerForm, buildOpen]);

  useEffect(() => {
    const needsDeckTemplates =
      runtimeFields.some((f) => f.type === "deckTemplate") ||
      buildOpen;
    if (!needsDeckTemplates || deckTemplates !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await listDeckTemplatesAction();
        if (!cancelled) {
          const presets = DECK_PRESETS.map((p) => ({ id: p.id, name: p.name }));
          if ("error" in list) {
            setDeckTemplates(presets);
            setDeckTemplatesError(list.error);
          } else {
            setDeckTemplates([...presets, ...list.templates.map((t) => ({ id: t.id, name: t.name }))]);
            setDeckTemplatesError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setDeckTemplates(DECK_PRESETS.map((p) => ({ id: p.id, name: p.name })));
          setDeckTemplatesError(err instanceof Error ? err.message : "Could not load templates.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, deckTemplates, buildOpen]);

  useEffect(() => {
    const needsAssignmentTemplates =
      runtimeFields.some((f) => f.type === "assignmentTemplate") ||
      buildOpen;
    if (!needsAssignmentTemplates || assignmentTemplates !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await listArtifactTemplatesAction("assignment");
        if (!cancelled) {
          if ("error" in list) {
            setAssignmentTemplates(presetsForKind("assignment").map((t) => ({ id: t.id, name: t.name })));
            setAssignmentTemplatesError(list.error);
          } else {
            setAssignmentTemplates(list.templates.map((t) => ({ id: t.id, name: t.name })));
            setAssignmentTemplatesError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setAssignmentTemplates(presetsForKind("assignment").map((t) => ({ id: t.id, name: t.name })));
          setAssignmentTemplatesError(err instanceof Error ? err.message : "Could not load templates.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, assignmentTemplates, buildOpen]);

  useEffect(() => {
    const needsTestTemplates =
      runtimeFields.some((f) => f.type === "testTemplate") ||
      buildOpen;
    if (!needsTestTemplates || testTemplates !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await listArtifactTemplatesAction("test");
        if (!cancelled) {
          if ("error" in list) {
            setTestTemplates(presetsForKind("test").map((t) => ({ id: t.id, name: t.name })));
            setTestTemplatesError(list.error);
          } else {
            setTestTemplates(list.templates.map((t) => ({ id: t.id, name: t.name })));
            setTestTemplatesError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setTestTemplates(presetsForKind("test").map((t) => ({ id: t.id, name: t.name })));
          setTestTemplatesError(err instanceof Error ? err.message : "Could not load templates.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, testTemplates, buildOpen]);
  useEffect(() => {
    const needsClassSessionTemplates =
      runtimeFields.some((f) => f.type === "classSessionTemplate") ||
      buildOpen;
    if (!needsClassSessionTemplates || classSessionTemplates !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await listArtifactTemplatesAction("class-session");
        if (!cancelled) {
          if ("error" in list) {
            setClassSessionTemplates(presetsForKind("class-session").map((t) => ({ id: t.id, name: t.name })));
            setClassSessionTemplatesError(list.error);
          } else {
            setClassSessionTemplates(list.templates.map((t) => ({ id: t.id, name: t.name })));
            setClassSessionTemplatesError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setClassSessionTemplates(presetsForKind("class-session").map((t) => ({ id: t.id, name: t.name })));
          setClassSessionTemplatesError(err instanceof Error ? err.message : "Could not load templates.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, classSessionTemplates, buildOpen]);

  useEffect(() => {
    const needsLmsCourseList =
      buildOpen || runtimeFields.some((f) => f.type === "lmsCourseList");
    if (!needsLmsCourseList || lmsCourseOptions !== null || !activeInstitution) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await listCoursesAction(activeInstitution);
        if (!cancelled) {
          if ("error" in result) {
            setLmsCourseOptionsError(result.error);
          } else {
            setLmsCourseOptions(
              result.courses.map((c) => ({
                url: `/courses/${c.id}`,
                name: c.name,
              }))
            );
            setLmsCourseOptionsError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLmsCourseOptionsError(err instanceof Error ? err.message : "Could not load courses.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, lmsCourseOptions, activeInstitution, buildOpen]);

  useEffect(() => {
    const needsOrg =
      buildOpen || runtimeFields.some((f) => f.type === "org" || f.type === "orgList");
    if (!needsOrg || orgs !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const r = await listMyOrgsAction();
        if (!cancelled) {
          if ("error" in r) {
            setOrgsError(r.error);
          } else {
            setOrgs(r.orgs);
            setOrgsError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setOrgsError(err instanceof Error ? err.message : "Could not load organizations.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtimeFields, orgs, buildOpen]);

  // lmsModule options come from the course chosen by the form's FIRST
  // hubCourse-typed field; a tile without a live LMS connection keeps an
  // empty list and the renderer shows the export-fallback hint instead.
  const lmsModuleNeeded = runtimeFields.some((x) => x.type === "lmsModule");
  const firstHubCourseValue = (() => {
    const f = runtimeFields.find((x) => x.type === "hubCourse");
    return f ? (values[f.fieldKey] ?? "") : "";
  })();
  const lmsModuleCanvasUrl =
    hubCourses?.find((c) => c.id === firstHubCourseValue.trim())?.canvasUrl ??
    "";

  const moduleSource = lmsModuleNeeded
    ? `${firstHubCourseValue}|${lmsModuleCanvasUrl}`
    : "";
  const [prevModuleSource, setPrevModuleSource] = useState(moduleSource);
  if (moduleSource !== prevModuleSource) {
    setPrevModuleSource(moduleSource);
    setLmsModuleOptions([]);
    setLmsModuleError(null);
    setLmsModuleFromExport(false);
  }

  useEffect(() => {
    if (!lmsModuleNeeded) return;
    const courseId = firstHubCourseValue.trim();

    let cancelled = false;

    const loadExportOptions = async (liveError: string | null) => {
      if (!courseId) return;
      try {
        const data = await loadCourseExportData(courseId);
        if (cancelled) return;
        if (data && data.modules.length > 0) {
          setLmsModuleOptions(
            data.modules.map((m) => ({
              value: exportModuleValue(m.name),
              label: m.name,
            }))
          );
          setLmsModuleFromExport(true);
        }
        setLmsModuleError(liveError);
      } catch (err) {
        if (!cancelled) {
          setLmsModuleError(
            liveError ?? (err instanceof Error ? err.message : "Could not load modules.")
          );
        }
      }
    };

    if (!lmsModuleCanvasUrl) {
      if (hubCourses !== null) {
        void loadExportOptions(null);
      }
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const content = await listCourseContentAction(
          lmsModuleCanvasUrl,
          activeInstitution || undefined
        );
        if (cancelled) return;
        if ("error" in content) {
          await loadExportOptions(content.error);
        } else {
          setLmsModuleOptions(
            content.modules.map((m: CanvasModule) => ({
              value: liveModuleValue(m.id, m.name),
              label: m.name,
            }))
          );
          setLmsModuleError(null);
          setLmsModuleFromExport(false);
        }
      } catch (err) {
        if (!cancelled) {
          await loadExportOptions(
            err instanceof Error ? err.message : "Could not load modules."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lmsModuleNeeded, lmsModuleCanvasUrl, firstHubCourseValue, activeInstitution, loadCourseExportData, hubCourses]);

  return {
    hubCourses,
    setHubCourses,
    hubCoursesError,
    deckTemplates,
    deckTemplatesError,
    assignmentTemplates,
    assignmentTemplatesError,
    testTemplates,
    testTemplatesError,
    classSessionTemplates,
    classSessionTemplatesError,
    lmsCourseOptions,
    lmsCourseOptionsError,
    lmsModuleOptions,
    lmsModuleError,
    lmsModuleFromExport,
    orgs,
    orgsError,
  };
}
