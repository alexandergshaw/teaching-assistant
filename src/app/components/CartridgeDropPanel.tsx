"use client";

import { useEffect, useRef, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import type { CartridgeDrop } from "@/lib/cartridge-drops";
import {
  saveCartridgeDrop,
  listCartridgeDrops,
  deleteCartridgeDrop,
  getCartridgeDropCsvUrl,
  CARTRIDGE_DROP_UPLOADED_EVENT,
} from "@/lib/cartridge-drops";
import {
  createWorkflowTrigger,
  updateWorkflowTrigger,
  listWorkflowTriggers,
  type WorkflowTrigger,
} from "@/lib/workflow-triggers";
import { readActiveInstitution } from "@/lib/institutions";
import { sniffSubmissionArchive, mergeSniffedValues, type SniffResult } from "@/lib/submission-archive-sniff";
import {
  loadRubricMemory,
  saveRubricMemory,
  describeRubricOrigin,
} from "@/lib/grade/rubric-memory";
import { resolveRubricOriginScope, describeDropRubricOrigin } from "@/lib/grade/rubric-origin";
import { formatRelative } from "@/app/utils/time";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import styles from "../page.module.css";

// A39 wave 2, path H: this surface's own ta- key for rubric-memory.ts,
// scoped per "cartridge:<course>|<assignment>" - never a global slot.
// DECISION 9 / RULING 109: the exact-set canary for src/app/components/'s
// own (non-recursive) ta- prefixed keys lives at
// componentStorageKeys.structure.test.ts, covering this file's keys and
// every other top-level file's in this directory.
const RUBRIC_MEMORY_STORAGE_KEY = "ta-cartridge-rubric";

function cartridgeRubricScope(course: string, assignment: string): string {
  return course.trim() && assignment.trim() ? `cartridge:${course}|${assignment}` : "";
}

export default function CartridgeDropPanel() {
  const { supabase, user } = useSupabase();
  const [drops, setDrops] = useState<CartridgeDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(true);
  const [triggersError, setTriggersError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state - persisted
  const [courseLabel, setCourseLabel] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-cartridge-course") ?? "";
  });
  const [assignmentLabel, setAssignmentLabel] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-cartridge-assignment") ?? "";
  });
  const [pointsPossible, setPointsPossible] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-cartridge-points") ?? "";
  });
  const [lms, setLms] = useState<"canvas" | "brightspace" | "blackboard" | "moodle">(() => {
    if (typeof window === "undefined") return "canvas";
    const saved = localStorage.getItem("ta-cartridge-lms");
    return saved === "brightspace" || saved === "blackboard" || saved === "moodle" ? saved : "canvas";
  });
  const [assignmentDescription, setAssignmentDescription] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-cartridge-description") ?? "";
  });
  const [rubricText, setRubricText] = useState("");
  // A39 wave 2: the visible rubric-memory origin label, and what THIS
  // component last restored (so a later edit is never overwritten).
  const [rubricOrigin, setRubricOrigin] = useState<string | null>(null);
  // A40 S2: retains the restored rubric's ACTUAL scope alongside its text,
  // so resolveRubricOriginScope can attribute an untouched upload to the
  // scope it was really restored from (not the scope requested now).
  const lastRestoredRubricRef = useRef<{ rubric: string; scope: string } | null>(null);
  const [sniffHint, setSniffHint] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [lmsChosen, setLmsChosen] = useState(() => {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem("ta-cartridge-lms-chosen") === "1") return true;
    const saved = localStorage.getItem("ta-cartridge-lms");
    return saved === "brightspace" || saved === "blackboard" || saved === "moodle";
  });

  // Persist form fields
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ta-cartridge-course", courseLabel);
    }
  }, [courseLabel]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ta-cartridge-assignment", assignmentLabel);
    }
  }, [assignmentLabel]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ta-cartridge-points", pointsPossible);
    }
  }, [pointsPossible]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ta-cartridge-description", assignmentDescription);
    }
  }, [assignmentDescription]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ta-cartridge-lms", lms);
    }
  }, [lms]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (lmsChosen) {
        localStorage.setItem("ta-cartridge-lms-chosen", "1");
      }
    }
  }, [lmsChosen]);

  // A39 wave 2, path H (docs/a39-architecture.md 6.2): restore only once
  // BOTH course and assignment are known (cartridgeRubricScope returns "" -
  // and rubric-memory.ts's own empty-scope guard refuses - until then), and
  // only into a field the instructor has not since edited themselves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scope = cartridgeRubricScope(courseLabel, assignmentLabel);
      if (!scope) return;
      const loaded = loadRubricMemory(RUBRIC_MEMORY_STORAGE_KEY, scope);
      if (!loaded) return;
      const untouched = rubricText === "" || rubricText === lastRestoredRubricRef.current?.rubric;
      if (!untouched) return;
      // react-hooks/set-state-in-effect (docs' set-state-in-effect-idiom):
      // every setState below must follow an await.
      await Promise.resolve();
      if (cancelled) return;
      if (loaded.entry.rubric !== rubricText) setRubricText(loaded.entry.rubric);
      lastRestoredRubricRef.current = { rubric: loaded.entry.rubric, scope: loaded.scope };
      setRubricOrigin(describeRubricOrigin(loaded, scope));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseLabel, assignmentLabel]);

  const loadDrops = async (uid: string) => {
    try {
      setLoading(true);
      const result = await listCartridgeDrops(supabase, uid);
      setDrops(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cartridge drops.");
    } finally {
      setLoading(false);
    }
  };

  // Load drops on mount or when user changes. Inline async body with a
  // cancelled flag; every setState happens after an await (loading starts
  // true), and loadDrops stays for event-handler reloads.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await listCartridgeDrops(supabase, user.id);
        if (!cancelled) {
          setDrops(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load cartridge drops.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Load workflow triggers on mount to check for existing auto-grade trigger.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await listWorkflowTriggers(supabase, user.id);
        if (!cancelled) {
          setTriggers(result);
          setTriggersError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setTriggersError(err instanceof Error ? err.message : "Could not load triggers.");
        }
      } finally {
        if (!cancelled) setTriggersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file || !user) {
      setSniffHint(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Run sniff to prefill fields (best-effort)
      let sniffResult: SniffResult = { notes: [] };
      try {
        sniffResult = await sniffSubmissionArchive(file);
      } catch (e) {
        console.error("sniff failed:", e);
      }

      // Compute effective values using empty-only rule
      const effective = mergeSniffedValues(
        {
          courseLabel,
          assignmentLabel,
          pointsPossible,
          rubricText,
          lms,
          lmsChosen,
        },
        sniffResult
      );

      // Update UI state with effective values
      setCourseLabel(effective.courseLabel);
      setAssignmentLabel(effective.assignmentLabel);
      setPointsPossible(effective.pointsPossible ? String(effective.pointsPossible) : "");
      setRubricText(effective.rubricText || "");
      if (!lmsChosen && sniffResult.lms) {
        setLms(effective.lms);
      }

      // Show hint with detected metadata
      if (sniffResult.notes.length > 0) {
        setSniffHint(`Detected from the archive: ${sniffResult.notes.join("; ")}`);
      } else {
        setSniffHint(null);
      }

      // A39 wave 2: remember this rubric under the SCOPE THIS UPLOAD ACTUALLY
      // USED (the effective course/assignment, not any stale state), so a
      // later drop for the same assignment restores it.
      const saveScope = cartridgeRubricScope(effective.courseLabel, effective.assignmentLabel);
      if (saveScope && effective.rubricText) {
        saveRubricMemory(RUBRIC_MEMORY_STORAGE_KEY, saveScope, { rubric: effective.rubricText });
      }

      // A40 DECISION 16 / RULING 105: the origin the row will disclose,
      // computed from what actually put text in the field - never from the
      // scope this upload requested (see rubric-origin.ts).
      const rubricOriginScope = resolveRubricOriginScope({
        rubricText: effective.rubricText,
        currentScope: saveScope,
        restored: lastRestoredRubricRef.current,
        sniffedRubric: sniffResult.rubricText ?? null,
        archiveName: file.name,
      });

      // Upload with effective values (passed directly, not relying on state which hasn't updated yet)
      const drop = await saveCartridgeDrop(supabase, user.id, file, {
        courseLabel: effective.courseLabel,
        assignmentLabel: effective.assignmentLabel,
        pointsPossible: effective.pointsPossible,
        rubricText: effective.rubricText,
        lms: effective.lms,
        rubricOriginScope,
        assignmentDescription: assignmentDescription.trim() || null,
      });
      setDrops((prev) => [drop, ...prev]);

      // Reset form
      setRubricText("");
      setSniffHint(null);
      // RULING 111: the caption sits directly above the file input (last
      // read before the next upload fires) and must never outlive the
      // rubric it names - clear it wherever its sibling setSniffHint(null)
      // clears.
      setRubricOrigin(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      window.dispatchEvent(new CustomEvent(CARTRIDGE_DROP_UPLOADED_EVENT));
    } catch (err) {
      console.error("Archive sniffing error:", err);
      setError(err instanceof Error ? err.message : "Could not upload cartridge.");
      setSniffHint(null);
      // RULING 111: same clear on the error path - the failed upload also
      // ends this rubric's lifetime.
      setRubricOrigin(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (drop: CartridgeDrop) => {
    if (deleteConfirm !== drop.id) {
      setDeleteConfirm(drop.id);
      return;
    }

    setDeleteConfirm(null);
    try {
      await deleteCartridgeDrop(supabase, drop);
      setDrops((prev) => prev.filter((d) => d.id !== drop.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete cartridge drop.");
    }
  };

  const handleDownloadCsv = async (drop: CartridgeDrop) => {
    try {
      const url = await getCartridgeDropCsvUrl(supabase, drop);
      const a = document.createElement("a");
      a.href = url;
      a.download = drop.csvName || "grades.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download CSV.");
    }
  };

  const findAutoGradeTrigger = (): WorkflowTrigger | undefined => {
    return triggers.find(
      (t) => t.eventType === "cartridge-uploaded" && t.workflowId === "cartridge-grading"
    );
  };

  const handleToggleAutoGrade = async () => {
    if (!user) return;
    try {
      const existing = findAutoGradeTrigger();
      if (existing) {
        if (existing.enabled) {
          await updateWorkflowTrigger(supabase, user.id, existing.id, { enabled: false });
        } else {
          await updateWorkflowTrigger(supabase, user.id, existing.id, { enabled: true });
        }
      } else {
        const activeInstitution = readActiveInstitution();
        await createWorkflowTrigger(supabase, user.id, {
          workflowId: "cartridge-grading",
          workflowName: "Grade Uploaded Submissions",
          fieldValues: {},
          eventType: "cartridge-uploaded",
          eventConfig: {},
          unattended: true,
          courseId: null,
          institution: activeInstitution || null,
        });
      }
      const updated = await listWorkflowTriggers(supabase, user.id);
      setTriggers(updated);
      setTriggersError(null);
    } catch (err) {
      setTriggersError(err instanceof Error ? err.message : "Could not update auto-grading.");
    }
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case "new":
        return styles.ghBadgeAccent || "";
      case "processing":
        return styles.ghBadgeWarning || "";
      case "graded":
        return styles.ghBadgeSuccess || "";
      case "error":
        return styles.ghBadgeDanger || "";
      default:
        return "";
    }
  };

  return (
    <div className={styles.card}>
      <h2>Student submissions</h2>
      <p className={styles.fieldHint}>
        Upload zips of student submissions for an assignment. Supported LMS export archives (.zip or .imscc files) for closed courses. A trigger-linked workflow grades submissions and produces upload-ready CSVs.
      </p>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.form}>
        {/* A40 wave 1 (RULING 106): all five non-file fields render above the
            file input, so the natural top-to-bottom fill order and any
            after-the-fact edit both land before the upload fires. */}
        <div className={styles.field}>
          <label htmlFor="cartridge-course">Course</label>
          <TextField
            size="small"
            fullWidth
            id="cartridge-course"
            value={courseLabel}
            onChange={(e) => setCourseLabel(e.target.value)}
            placeholder="e.g., CSCI 101 - Introduction to Computer Science"
            disabled={loading}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="cartridge-assignment">Assignment</label>
          <TextField
            size="small"
            fullWidth
            id="cartridge-assignment"
            value={assignmentLabel}
            onChange={(e) => setAssignmentLabel(e.target.value)}
            placeholder="e.g., Project 1: Binary Search Tree"
            disabled={loading}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="cartridge-points">Points Possible</label>
          <TextField
            size="small"
            type="number"
            id="cartridge-points"
            value={pointsPossible}
            onChange={(e) => setPointsPossible(e.target.value)}
            placeholder="e.g., 100"
            disabled={loading}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="cartridge-lms">LMS</label>
          <TextField
            select
            size="small"
            id="cartridge-lms"
            value={lms}
            onChange={(e) => {
              setLms(e.target.value as "canvas" | "brightspace" | "blackboard" | "moodle");
              setLmsChosen(true);
            }}
            disabled={loading}
          >
            <MenuItem value="canvas">Canvas</MenuItem>
            <MenuItem value="brightspace">Brightspace</MenuItem>
            <MenuItem value="blackboard">Blackboard</MenuItem>
            <MenuItem value="moodle">Moodle</MenuItem>
          </TextField>
        </div>

        <div className={styles.field}>
          <label htmlFor="cartridge-description">Assignment description (optional)</label>
          <TextField
            multiline
            minRows={3}
            maxRows={10}
            fullWidth
            id="cartridge-description"
            value={assignmentDescription}
            onChange={(e) => setAssignmentDescription(e.target.value)}
            placeholder="Paste the assignment instructions students were given. Grading uses this; without it only the course and assignment names are used."
            disabled={loading}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="cartridge-rubric">Rubric (optional)</label>
          <TextField
            multiline
            minRows={4}
            maxRows={12}
            fullWidth
            id="cartridge-rubric"
            value={rubricText}
            onChange={(e) => setRubricText(e.target.value)}
            placeholder="Paste a rubric or grading criteria."
            disabled={loading}
          />
          {rubricOrigin && <p className={styles.fieldHint}>{rubricOrigin}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor="cartridge-file">Submissions Archive</label>
          <div className={styles.fileField}>
            <input
              ref={fileInputRef}
              id="cartridge-file"
              type="file"
              accept=".zip,.imscc,application/zip"
              onChange={handleFileSelect}
              disabled={loading}
            />
            <p>Upload a .zip or .imscc archive of student submissions.</p>
          </div>
          {sniffHint && <p className={styles.fieldHint}>{sniffHint}</p>}
        </div>
      </div>

      {/* Automatic grading control */}
      <div style={{ marginTop: "var(--space-6)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--border-soft)" }}>
        {triggersError && (
          <p role="alert" className={styles.error}>
            {triggersError}
          </p>
        )}
        {triggersLoading && (
          <p role="status" aria-live="polite" style={{ margin: 0, fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
            Loading auto-grading settings…
          </p>
        )}
        {!triggersLoading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}>
            <div style={{ flex: 1 }}>
              {findAutoGradeTrigger()?.enabled ? (
                <>
                  <p style={{ margin: "0 0 var(--space-1) 0", fontWeight: 500 }}>Auto-grading is on</p>
                  <p style={{ margin: 0, fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
                    New uploads are graded automatically; grades land in Drafts and gradebook CSVs in this panel.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: "0 0 var(--space-1) 0", fontWeight: 500 }}>Automatic grading</p>
                  <p style={{ margin: 0, fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
                    New uploads are graded automatically; grades land in Drafts and gradebook CSVs in this panel.
                  </p>
                </>
              )}
            </div>
            <Button
              size="small"
              variant={findAutoGradeTrigger()?.enabled ? "outlined" : "contained"}
              onClick={() => void handleToggleAutoGrade()}
              disabled={loading || triggersLoading}
            >
              {findAutoGradeTrigger()?.enabled ? "Turn off" : "Turn on auto-grading"}
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Loading submissions…</p>
          </div>
        </div>
      )}

      {/* Drops table */}
      {drops.length > 0 && (
        <div>
          <div style={{ overflowX: "auto" }}>
            <table className={styles.courseScheduleTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Course / Assignment</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drops.map((drop) => (
                  <tr key={drop.id}>
                    <td>{drop.name}</td>
                    <td>
                      {drop.courseLabel}
                      {drop.assignmentLabel ? ` / ${drop.assignmentLabel}` : ""}
                      <p className={styles.fieldHint}>
                        {describeDropRubricOrigin(drop.rubricOriginScope, Boolean(drop.rubricText)).text}
                      </p>
                    </td>
                    <td>
                      <span className={getStatusBadgeClass(drop.status)}>
                        {drop.status}
                      </span>
                      {drop.error && <p className={styles.error}>{drop.error}</p>}
                    </td>
                    <td>
                      {formatRelative(drop.createdAt)}
                    </td>
                    <td>
                      {drop.status === "graded" && drop.csvName && (
                        <Button
                          size="small"
                          onClick={() => handleDownloadCsv(drop)}
                          disabled={loading}
                        >
                          Download CSV
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => void handleDelete(drop)}
                        disabled={loading}
                      >
                        {deleteConfirm === drop.id ? "Confirm" : "Delete"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            size="small"
            onClick={() => user && loadDrops(user.id)}
            disabled={loading}
            sx={{ marginTop: "var(--space-2)" }}
          >
            Refresh
          </Button>
        </div>
      )}

      {drops.length === 0 && !loading && (
        <p className={styles.fieldHint}>No cartridge drops yet. Upload one above to get started.</p>
      )}
    </div>
  );
}
