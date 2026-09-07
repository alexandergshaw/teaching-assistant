"use client";

// Grading from a screen recording - the D23a/D23b per-course, per-assessment
// DECLARATION store: an instructor-entered DEADLINE per assessment, and
// which TOOL is authoritative (the complete record) for a given KIND of
// work in a course. Read docs/course-student-intelligence-acceptance-
// criteria.md D23a, D23b and D23c in full before touching this file - D23a
// in particular, since it names the exact failure mode this store exists to
// make detectable: "a half-migrated assessment producing a confident
// missing list is the worst outcome available here."
//
// D23a's HOMOGENEITY ASSUMPTION IS THE LOAD-BEARING IDEA: "if one tool is
// the complete record for a kind of work, then absence of a row means the
// work is absent." That upgrades "missing" from a weak relative signal
// ("no recorded work compared to classmates") to an absolute one compared
// against the whole roster - but ONLY if the assumption actually holds, and
// it can silently stop holding the moment an instructor grades even one
// assessment through a second tool without updating anything here. So this
// store exists to make that DECLARATION explicit, never inferred - nothing
// in this file computes a deadline or guesses which tool is authoritative
// from recorded data. It is the instructor's own statement about how they
// work, and it is worthless as a signal the moment this code starts
// "helpfully" inferring instead of asking.
//
// WHERE THIS LIVES AND WHY: this directory's other per-course, per-
// instructor grading state (useGradingRows.ts's own table, and
// GradingRecordingPanel.tsx's own STORAGE_KEY_COURSE course selection) all
// persist to localStorage under this directory's shared key prefix,
// read/written through a small `use*` hook - this file follows that same
// shape rather than introducing a second persistence mechanism into this
// directory. It is a
// NEW file, not folded into an existing one, because:
//   - useGradingRows.ts owns the grading TABLE - rows minted from captured
//     submissions. A deadline for "Essay 2" is instructor-entered state that
//     exists whether or not a single submission has ever been captured for
//     it, so it does not belong on that table or its row type.
//   - useGradingCourses.ts is a live, READ-ONLY fetch from course_hub - it
//     persists nothing itself. Bolting an unrelated, locally-persisted
//     concern onto a lazy remote-data hook would blur what that file is for.
//
// ASSESSMENT IDENTITY: there is no assessment id anywhere else in this app
// to borrow. GradingRecordingPanel.tsx has no assessment selector today -
// verified directly against that file before this store was designed (see
// grading-row.ts's own `assessment` doc comment for the same finding, made
// while building that field). So `assessmentId` below is a short,
// instructor-TYPED label ("Essay 2", "Week 3 discussion") - the
// instructor's own name for the thing they are declaring a deadline for,
// not a foreign key into any other table. A future assessment picker on
// GradingRow (grading-row.ts's own `assessment` field) is expected to key
// off the SAME kind of string once one exists, which is why this store's
// `assessmentId` and that field share the same "instructor-typed label"
// character rather than one being a real id and the other a guess at one.
//
// REACHABILITY, STATED HONESTLY: nothing in this codebase calls
// `useGradingAssessmentDeclarations` yet. GradingRecordingPanel.tsx (the
// only place an instructor could enter a deadline or declare a tool) is out
// of this task's file set and has no UI for either today. This file is the
// store and its round-trip, built and tested on its own - not a UI, and not
// claimed to be wired into one. A future wave adding that UI is expected to
// call the functions below rather than inventing a second store.
//
// KEYS ARE WHOLE STRING LITERALS, never a template literal - this
// directory's own key-inventory canary (grading-rows.test.ts's "grading-
// recording persisted key canary" block) can only ever see a FIXED set of
// literal keys spelled out in source text, never one computed from a
// runtime course id - see grading-row.ts's own D21d comment for why
// course-scoping already had to solve this exact constraint. So, like the
// grading TABLE itself, this is ONE storage key holding every course's
// declarations together, scoped by a `courseId` FIELD on each record rather
// than a key per course.

import { useCallback, useRef, useState } from "react";

const STORAGE_KEY_DECLARATIONS = "ta-rec-grade-declarations";

const DECLARATIONS_VERSION = 1;

/** D23a: "discussion posts, assignments" - the exact granularity the owner
 *  described (docs/course-student-intelligence-acceptance-criteria.md D23's
 *  own verbatim quote). A closed set, not free text, because the
 *  authoritative-tool declaration and a future violation check both need to
 *  compare two of these for equality - a free-text "kind" would let
 *  "Assignments" and "assignment" silently fail to match. */
export const GRADING_WORK_KINDS = ["discussion", "assignment"] as const;
export type GradingWorkKind = (typeof GRADING_WORK_KINDS)[number];

/**
 * D23b: one assessment's instructor-entered deadline, plus which KIND of
 * work it is - D23a's tool declaration is made at the (course, workKind)
 * granularity below, and `workKind` here is how one assessment record says
 * which of those declarations governs it.
 */
export interface GradingAssessmentDeclaration {
  courseId: string;
  assessmentId: string;
  /** The instructor's own display label for this assessment - "Essay 2",
   *  "Week 3 discussion". Shown back to them; never parsed or matched on -
   *  `assessmentId` is the key, this is only ever a label. */
  assessmentLabel: string;
  workKind: GradingWorkKind;
  /** ISO-ish datetime string, instructor-entered. "" means "not yet set" -
   *  see `gradingAssessmentDeadline` below, the one place "" is treated as
   *  "no deadline declared" rather than a real instant in time. */
  deadline: string;
}

/**
 * D23a: the homogeneity declaration itself - "for THIS course, THIS kind of
 * work is completely and exclusively recorded by THIS tool." One record per
 * (course, workKind), never per assessment - matching D23a's own stated
 * granularity ("the authoritative tool is recorded per course and per work
 * kind").
 */
export interface GradingToolDeclaration {
  courseId: string;
  workKind: GradingWorkKind;
  /** The instructor's own name for the authoritative tool - "Screen
   *  recording (this app)", "Canvas SpeedGrader", "the repo grader". Free
   *  text, deliberately never a closed enum: this repo has no fixed
   *  catalogue of grading tools to choose from, and forcing one here would
   *  be exactly the kind of invented value this store exists to avoid. ""
   *  means "not yet declared" - see `gradingAuthoritativeTool` below. */
  tool: string;
}

interface GradingDeclarationsState {
  assessments: GradingAssessmentDeclaration[];
  tools: GradingToolDeclaration[];
}

const EMPTY_DECLARATIONS: GradingDeclarationsState = { assessments: [], tools: [] };

// ---------------------------------------------------------------------------
// Pure serialization - version constant, write, read. Kept in this one file
// (not split out like grading-row-serialization.ts) because this store owns
// its own types from scratch; there is no pre-existing type this logic must
// sit "beside" the way that split was justified for GradingRow.
// ---------------------------------------------------------------------------

/** The normal write path - both lists, explicitly enumerated (mirrors
 *  grading-row-serialization.ts's own no-spread discipline, applied here
 *  even though this store carries no student-identity boundary to protect -
 *  explicit enumeration is simply the safer default for anything that
 *  reaches localStorage in this repo). */
export function serializeGradingDeclarations(
  assessments: ReadonlyArray<GradingAssessmentDeclaration>,
  tools: ReadonlyArray<GradingToolDeclaration>
): string {
  return JSON.stringify({
    v: DECLARATIONS_VERSION,
    assessments: assessments.map((a) => ({
      courseId: a.courseId,
      assessmentId: a.assessmentId,
      assessmentLabel: a.assessmentLabel,
      workKind: a.workKind,
      deadline: a.deadline,
    })),
    tools: tools.map((t) => ({ courseId: t.courseId, workKind: t.workKind, tool: t.tool })),
  });
}

const VALID_WORK_KINDS = new Set<string>(GRADING_WORK_KINDS);

function coerceWorkKind(raw: unknown): GradingWorkKind | null {
  return typeof raw === "string" && VALID_WORK_KINDS.has(raw) ? (raw as GradingWorkKind) : null;
}

/**
 * NEVER throws - mirrors deserializeGradingRows's own discipline (this
 * directory's precedent, itself mirroring deserializeReplyTable): a
 * top-level try/catch, defensive typeof/Array.isArray guards before
 * touching anything, and an individual record that cannot be recovered (no
 * usable key, or an unrecognized `workKind` - D23a: never guess a work
 * kind) is dropped on its own rather than failing the whole read.
 */
export function deserializeGradingDeclarations(raw: string | null): GradingDeclarationsState {
  try {
    if (!raw) return EMPTY_DECLARATIONS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_DECLARATIONS;
    const obj = parsed as Record<string, unknown>;
    // A version mismatch (including a hypothetical future or older version
    // this code does not know how to read) degrades to empty rather than
    // guessing at a shape it was never told about.
    if (obj.v !== DECLARATIONS_VERSION) return EMPTY_DECLARATIONS;

    const assessments: GradingAssessmentDeclaration[] = [];
    if (Array.isArray(obj.assessments)) {
      for (const rawEntry of obj.assessments) {
        if (!rawEntry || typeof rawEntry !== "object") continue;
        const e = rawEntry as Record<string, unknown>;
        const courseId = typeof e.courseId === "string" ? e.courseId : "";
        const assessmentId = typeof e.assessmentId === "string" ? e.assessmentId.trim() : "";
        if (!courseId || !assessmentId) continue; // no usable key - this record is unrecoverable
        const workKind = coerceWorkKind(e.workKind);
        if (!workKind) continue; // D23a: never guess a work kind - drop the record instead
        const assessmentLabel = typeof e.assessmentLabel === "string" ? e.assessmentLabel : "";
        const deadline = typeof e.deadline === "string" ? e.deadline : "";
        assessments.push({ courseId, assessmentId, assessmentLabel, workKind, deadline });
      }
    }

    const tools: GradingToolDeclaration[] = [];
    if (Array.isArray(obj.tools)) {
      for (const rawEntry of obj.tools) {
        if (!rawEntry || typeof rawEntry !== "object") continue;
        const e = rawEntry as Record<string, unknown>;
        const courseId = typeof e.courseId === "string" ? e.courseId : "";
        const workKind = coerceWorkKind(e.workKind);
        if (!courseId || !workKind) continue;
        const tool = typeof e.tool === "string" ? e.tool : "";
        tools.push({ courseId, workKind, tool });
      }
    }

    return { assessments, tools };
  } catch {
    return EMPTY_DECLARATIONS;
  }
}

// ---------------------------------------------------------------------------
// Pure lookup/mutation helpers - independently testable, and the seam the
// hook below is built on, mirroring stampGradingRowsWithCourse's own "pure
// function backing a thin hook" shape in useGradingRows.ts.
// ---------------------------------------------------------------------------

/** D23b: the declared deadline for (courseId, assessmentId), or null when
 *  none has been declared yet - null, never "", so a caller cannot mistake
 *  "not declared" for a real (empty-looking) instant. */
export function gradingAssessmentDeadline(
  assessments: ReadonlyArray<GradingAssessmentDeclaration>,
  courseId: string,
  assessmentId: string
): string | null {
  const found = assessments.find((a) => a.courseId === courseId && a.assessmentId === assessmentId);
  return found && found.deadline ? found.deadline : null;
}

/** D23a: the declared authoritative tool for (courseId, workKind), or null
 *  when nothing has been declared yet. */
export function gradingAuthoritativeTool(
  tools: ReadonlyArray<GradingToolDeclaration>,
  courseId: string,
  workKind: GradingWorkKind
): string | null {
  const found = tools.find((t) => t.courseId === courseId && t.workKind === workKind);
  return found && found.tool ? found.tool : null;
}

/** Replaces (courseId, assessmentId)'s own record, or appends a new one -
 *  never produces two records for the same key. */
export function upsertAssessmentDeclaration(
  assessments: ReadonlyArray<GradingAssessmentDeclaration>,
  next: GradingAssessmentDeclaration
): GradingAssessmentDeclaration[] {
  const idx = assessments.findIndex((a) => a.courseId === next.courseId && a.assessmentId === next.assessmentId);
  if (idx === -1) return [...assessments, next];
  return assessments.map((a, i) => (i === idx ? next : a));
}

/** Same shape as upsertAssessmentDeclaration, keyed on (courseId, workKind)
 *  instead. */
export function upsertToolDeclaration(
  tools: ReadonlyArray<GradingToolDeclaration>,
  next: GradingToolDeclaration
): GradingToolDeclaration[] {
  const idx = tools.findIndex((t) => t.courseId === next.courseId && t.workKind === next.workKind);
  if (idx === -1) return [...tools, next];
  return tools.map((t, i) => (i === idx ? next : t));
}

/**
 * D23a's "must be checkable" requirement: true when `assessment`'s own
 * declared work kind has an authoritative tool declared in `tools` that is
 * NOT `actualTool` - i.e. grading for this assessment showed up somewhere
 * other than where the instructor said it would, which means this
 * assessment's missing count is WRONG and must be stated as such, never
 * silently averaged over (D23a's own words).
 *
 * This only compares two DECLARED strings; it does not, and cannot from
 * this file alone, discover `actualTool` itself - that requires knowing
 * which tool actually produced a given piece of grading data, which lives
 * outside this store. A future caller (course-intel, a later wave) is
 * expected to supply `actualTool` from wherever it can determine that; this
 * function is what makes the comparison possible once it can. Returns
 * `false` (no detectable violation) when nothing has been declared for this
 * work kind yet - an undeclared tool is a gap this store already reports
 * through `gradingAuthoritativeTool` returning null, not a violation of a
 * declaration that does not exist.
 */
export function gradingAssessmentToolViolation(
  assessment: GradingAssessmentDeclaration,
  tools: ReadonlyArray<GradingToolDeclaration>,
  actualTool: string
): boolean {
  const declared = gradingAuthoritativeTool(tools, assessment.courseId, assessment.workKind);
  return declared !== null && declared !== actualTool;
}

// ---------------------------------------------------------------------------
// The hook. Read-once-in-the-initializer, ref-backed synchronous source of
// truth, persist on every commit - mirrors useGradingRows.ts's own
// rowsRef/commitRows shape exactly (see that file's header for why: a
// setState updater is not used to compute-and-persist together, since
// React's dev-mode double-invocation of updater functions would double the
// localStorage write for what should be a one-time side effect per call).
// ---------------------------------------------------------------------------

export interface UseGradingAssessmentDeclarationsReturn {
  assessments: GradingAssessmentDeclaration[];
  tools: GradingToolDeclaration[];
  setAssessmentDeadline: (
    courseId: string,
    assessmentId: string,
    assessmentLabel: string,
    workKind: GradingWorkKind,
    deadline: string
  ) => void;
  setAuthoritativeTool: (courseId: string, workKind: GradingWorkKind, tool: string) => void;
}

export function useGradingAssessmentDeclarations(): UseGradingAssessmentDeclarationsReturn {
  const [declarations, setDeclarations] = useState<GradingDeclarationsState>(() => {
    if (typeof window === "undefined") return EMPTY_DECLARATIONS;
    return deserializeGradingDeclarations(window.localStorage.getItem(STORAGE_KEY_DECLARATIONS));
  });
  const declarationsRef = useRef<GradingDeclarationsState>(declarations);

  const persist = useCallback((next: GradingDeclarationsState) => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY_DECLARATIONS,
        serializeGradingDeclarations(next.assessments, next.tools)
      );
    } catch {
      // Best-effort, mirrors useGradingRows.ts's own low-stakes-control
      // handling for its filter/sort keys - these declarations are a
      // handful of rows per course, nowhere near the quota pressure the
      // grading TABLE itself (a real class's worth of submission text)
      // hits, so no reduced-write fallback is warranted here.
    }
  }, []);

  const commit = useCallback(
    (next: GradingDeclarationsState) => {
      declarationsRef.current = next;
      setDeclarations(next);
      persist(next);
    },
    [persist]
  );

  const setAssessmentDeadline = useCallback(
    (courseId: string, assessmentId: string, assessmentLabel: string, workKind: GradingWorkKind, deadline: string) => {
      const next: GradingDeclarationsState = {
        ...declarationsRef.current,
        assessments: upsertAssessmentDeclaration(declarationsRef.current.assessments, {
          courseId,
          assessmentId,
          assessmentLabel,
          workKind,
          deadline,
        }),
      };
      commit(next);
    },
    [commit]
  );

  const setAuthoritativeTool = useCallback(
    (courseId: string, workKind: GradingWorkKind, tool: string) => {
      const next: GradingDeclarationsState = {
        ...declarationsRef.current,
        tools: upsertToolDeclaration(declarationsRef.current.tools, { courseId, workKind, tool }),
      };
      commit(next);
    },
    [commit]
  );

  return {
    assessments: declarations.assessments,
    tools: declarations.tools,
    setAssessmentDeadline,
    setAuthoritativeTool,
  };
}
