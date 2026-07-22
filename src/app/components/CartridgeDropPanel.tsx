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
import { formatRelative } from "@/app/utils/time";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import styles from "../page.module.css";

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
  const [rubricText, setRubricText] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
      localStorage.setItem("ta-cartridge-lms", lms);
    }
  }, [lms]);

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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file || !user) return;

    try {
      setLoading(true);
      setError(null);
      const drop = await saveCartridgeDrop(supabase, user.id, file, {
        courseLabel,
        assignmentLabel,
        pointsPossible: pointsPossible ? Number(pointsPossible) : null,
        rubricText: rubricText || null,
        lms,
      });
      setDrops((prev) => [drop, ...prev]);
      // Reset form
      setRubricText("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      window.dispatchEvent(new CustomEvent(CARTRIDGE_DROP_UPLOADED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload cartridge.");
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
        <div className={styles.field}>
          <label htmlFor="cartridge-file">Submissions Archive</label>
          <div className={styles.fileField}>
            <input
              ref={fileInputRef}
              id="cartridge-file"
              type="file"
              accept=".zip,.imscc,application/zip"
              onChange={handleUpload}
              disabled={loading}
            />
            <p>Upload a .zip or .imscc archive of student submissions.</p>
          </div>
        </div>

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
            onChange={(e) => setLms(e.target.value as "canvas" | "brightspace" | "blackboard" | "moodle")}
            disabled={loading}
          >
            <MenuItem value="canvas">Canvas</MenuItem>
            <MenuItem value="brightspace">Brightspace</MenuItem>
            <MenuItem value="blackboard">Blackboard</MenuItem>
            <MenuItem value="moodle">Moodle</MenuItem>
          </TextField>
        </div>

        <div className={styles.field}>
          <label htmlFor="cartridge-rubric">Rubric (optional)</label>
          <TextField
            multiline
            minRows={4}
            fullWidth
            id="cartridge-rubric"
            value={rubricText}
            onChange={(e) => setRubricText(e.target.value)}
            placeholder="Paste a rubric or grading criteria. If blank, the workflow will generate one."
            disabled={loading}
          />
        </div>
      </div>

      {/* Automatic grading control */}
      <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border, #e5e5e5)" }}>
        {triggersError && (
          <p role="alert" className={styles.error}>
            {triggersError}
          </p>
        )}
        {!triggersLoading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ flex: 1 }}>
              {findAutoGradeTrigger()?.enabled ? (
                <>
                  <p style={{ margin: "0 0 0.25rem 0", fontWeight: 500 }}>Auto-grading is on</p>
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-text-secondary, #666)" }}>
                    New uploads are graded automatically; grades land in Drafts and gradebook CSVs in this panel.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: "0 0 0.25rem 0", fontWeight: 500 }}>Automatic grading</p>
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-text-secondary, #666)" }}>
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
            sx={{ marginTop: 1 }}
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
